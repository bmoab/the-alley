import { randomUUID } from "node:crypto";

/**
 * Square integration (sandbox) with a graceful offline fallback.
 *
 * If SQUARE_ACCESS_TOKEN + SQUARE_LOCATION_ID are present, real sandbox API
 * calls are made. Otherwise every operation is SIMULATED and logged, so the
 * full demo works without any Square account.
 *
 * Operations used by the app:
 *   - createBookingInvoice(booking)  -> { invoiceId, paymentLink, simulated }
 *   - getInvoiceStatus(invoiceId)    -> "unpaid" | "paid" | "refunded" | "unknown"
 *   - refundDeposit(booking)         -> { refundId, simulated }
 */

const TOKEN = process.env.SQUARE_ACCESS_TOKEN;
const LOCATION_ID = process.env.SQUARE_LOCATION_ID;
const ENVIRONMENT = process.env.SQUARE_ENVIRONMENT || "sandbox";

export function isSquareConfigured() {
  return Boolean(TOKEN && LOCATION_ID);
}

function apiBase() {
  return ENVIRONMENT === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";
}

async function squareFetch(path, body, method = "POST") {
  const res = await fetch(`${apiBase()}${path}`, {
    method,
    headers: {
      "Square-Version": "2024-09-19",
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.errors?.[0]?.detail || res.statusText;
    throw new Error(`Square API ${res.status}: ${msg}`);
  }
  return data;
}

function dollarsToCents(n) {
  return Math.round((Number(n) || 0) * 100);
}

/**
 * Create an invoice with two line items (rental + refundable deposit) and a
 * public payment link. Returns the invoice id + payment URL.
 */
export async function createBookingInvoice(booking) {
  const rentalCents = dollarsToCents(
    (Number(booking.rate) || 0) *
      (Number(booking.hours) || 0) *
      Math.max(1, Number(booking.sessions) || 1)
  );
  // Recurring-series rows are rental-only: the one deposit for the series is
  // billed separately via createDepositInvoice, so per-date cancellation is a
  // clean full refund. Single bookings keep the deposit line as before.
  const depositCents = booking.series_id ? 0 : dollarsToCents(booking.deposit);

  // Comped booking (e.g. a tenant's free booking): Square rejects any invoice
  // totalling under $0.01, so there is nothing to bill. Callers treat a null
  // invoiceId as "no payment due" and confirm the booking outright.
  if (rentalCents + depositCents === 0) {
    console.log(`[square] booking #${booking.id} totals $0 — comped, no invoice created`);
    return { invoiceId: null, paymentLink: null, comped: true };
  }

  if (!isSquareConfigured()) {
    // ---- Simulated path ----
    const invoiceId = `SIM-INV-${booking.id}-${randomUUID().slice(0, 8)}`;
    const paymentLink = `${process.env.APP_URL || "http://localhost:3000"}/pay/${invoiceId}`;
    console.log(
      `[square:SIMULATED] Would create invoice for booking #${booking.id}:\n` +
        `   • Space rental: $${(rentalCents / 100).toFixed(2)}\n` +
        (depositCents > 0 ? `   • Refundable cleaning deposit: $${(depositCents / 100).toFixed(2)}\n` : "") +
        `   • Total due: $${((rentalCents + depositCents) / 100).toFixed(2)}\n` +
        `   → invoiceId=${invoiceId}  paymentLink=${paymentLink}`
    );
    return { invoiceId, paymentLink, simulated: true };
  }

  // ---- Real Square sandbox path ----
  // 1) Find or create a Square customer (invoices require a recipient).
  const [firstName, ...rest] = String(booking.client_name || "Guest").trim().split(" ");
  const customer = await squareFetch("/v2/customers", {
    idempotency_key: randomUUID(),
    given_name: firstName || "Guest",
    family_name: rest.join(" ") || undefined,
    email_address: booking.client_email || undefined,
  });
  const customerId = customer.customer.id;

  // 2) Create an order with the two line items.
  const lineItems = [
    {
      name: "Space rental — The Alley On Center",
      quantity: "1",
      base_price_money: { amount: rentalCents, currency: "USD" },
    },
  ];
  if (depositCents > 0) {
    lineItems.push({
      name: "Refundable cleaning deposit",
      quantity: "1",
      base_price_money: { amount: depositCents, currency: "USD" },
    });
  }
  const order = await squareFetch("/v2/orders", {
    idempotency_key: randomUUID(),
    order: {
      location_id: LOCATION_ID,
      customer_id: customerId,
      line_items: lineItems,
    },
  });
  const orderId = order.order.id;

  // 3) Create a draft invoice against the order, then publish it. Square
  //    requires a primary recipient (customer) and a due_date on the request.
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 7);
  const dueDateStr = dueDate.toISOString().slice(0, 10); // YYYY-MM-DD

  const invoice = await squareFetch("/v2/invoices", {
    idempotency_key: randomUUID(),
    invoice: {
      location_id: LOCATION_ID,
      order_id: orderId,
      primary_recipient: { customer_id: customerId },
      delivery_method: "SHARE_MANUALLY",
      accepted_payment_methods: { card: true },
      payment_requests: [
        { request_type: "BALANCE", due_date: dueDateStr, tipping_enabled: false },
      ],
      title: "The Alley On Center — Space Reservation",
    },
  });
  const invoiceId = invoice.invoice.id;
  const version = invoice.invoice.version;

  const published = await squareFetch(`/v2/invoices/${invoiceId}/publish`, {
    idempotency_key: randomUUID(),
    version,
  });
  const paymentLink = published.invoice?.public_url || null;

  console.log(`[square] Published invoice ${invoiceId} → ${paymentLink}`);
  return { invoiceId, paymentLink, simulated: false };
}

/**
 * Create a standalone invoice for a recurring series' single cleaning deposit
 * (one line item). Kept separate from the per-date rental invoices so each
 * rental stays cleanly, fully refundable. Returns { invoiceId, paymentLink,
 * simulated }.
 */
export async function createDepositInvoice(holder) {
  const depositCents = dollarsToCents(holder.deposit);

  // Deposit waived for this series — nothing to invoice. See createBookingInvoice.
  if (depositCents === 0) {
    console.log(`[square] series #${holder.series_id || holder.id} deposit is $0 — comped, no invoice created`);
    return { invoiceId: null, paymentLink: null, comped: true };
  }

  if (!isSquareConfigured()) {
    const invoiceId = `SIM-DEP-${holder.id}-${randomUUID().slice(0, 8)}`;
    const paymentLink = `${process.env.APP_URL || "http://localhost:3000"}/pay/${invoiceId}`;
    console.log(
      `[square:SIMULATED] Would create deposit invoice for series #${holder.series_id || holder.id}:\n` +
        `   • Refundable cleaning deposit: $${(depositCents / 100).toFixed(2)}\n` +
        `   → invoiceId=${invoiceId}  paymentLink=${paymentLink}`
    );
    return { invoiceId, paymentLink, simulated: true };
  }

  const [firstName, ...rest] = String(holder.client_name || "Guest").trim().split(" ");
  const customer = await squareFetch("/v2/customers", {
    idempotency_key: randomUUID(),
    given_name: firstName || "Guest",
    family_name: rest.join(" ") || undefined,
    email_address: holder.client_email || undefined,
  });
  const customerId = customer.customer.id;

  const order = await squareFetch("/v2/orders", {
    idempotency_key: randomUUID(),
    order: {
      location_id: LOCATION_ID,
      customer_id: customerId,
      line_items: [
        {
          name: "Refundable cleaning deposit (recurring series)",
          quantity: "1",
          base_price_money: { amount: depositCents, currency: "USD" },
        },
      ],
    },
  });

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 7);
  const dueDateStr = dueDate.toISOString().slice(0, 10);

  const invoice = await squareFetch("/v2/invoices", {
    idempotency_key: randomUUID(),
    invoice: {
      location_id: LOCATION_ID,
      order_id: order.order.id,
      primary_recipient: { customer_id: customerId },
      delivery_method: "SHARE_MANUALLY",
      accepted_payment_methods: { card: true },
      payment_requests: [
        { request_type: "BALANCE", due_date: dueDateStr, tipping_enabled: false },
      ],
      title: "The Alley On Center — Recurring Series Deposit",
    },
  });
  const invoiceId = invoice.invoice.id;

  const published = await squareFetch(`/v2/invoices/${invoiceId}/publish`, {
    idempotency_key: randomUUID(),
    version: invoice.invoice.version,
  });
  const paymentLink = published.invoice?.public_url || null;

  console.log(`[square] Published deposit invoice ${invoiceId} → ${paymentLink}`);
  return { invoiceId, paymentLink, simulated: false };
}

export async function getInvoiceStatus(invoiceId) {
  if (!invoiceId) return "unknown";
  if (!isSquareConfigured() || invoiceId.startsWith("SIM-")) {
    // Simulated invoices don't have a real status; the admin "mark as paid"
    // action drives state in the demo.
    return "unknown";
  }
  const data = await squareFetch(`/v2/invoices/${invoiceId}`, null, "GET");
  const status = data.invoice?.status; // e.g. PAID, UNPAID, PARTIALLY_PAID
  if (status === "PAID") return "paid";
  if (status === "REFUNDED") return "refunded";
  return "unpaid";
}

/**
 * Cancel a published, unpaid invoice — used when an approved booking is
 * repriced and a fresh invoice is issued in its place, so the client never sees
 * two live payment links. Best-effort and idempotent-ish: a missing/simulated
 * invoice, or one Square already considers canceled/paid, resolves without
 * throwing. Returns { canceled, simulated, skipped }.
 */
export async function cancelInvoice(invoiceId) {
  if (!invoiceId) return { canceled: false, skipped: "no_invoice" };
  if (!isSquareConfigured() || invoiceId.startsWith("SIM-")) {
    return { canceled: true, simulated: true };
  }
  // Cancel needs the invoice's current version.
  const data = await squareFetch(`/v2/invoices/${invoiceId}`, null, "GET");
  const inv = data.invoice;
  if (!inv) return { canceled: false, skipped: "not_found" };
  if (inv.status === "PAID" || inv.status === "PARTIALLY_PAID") {
    // Never cancel an invoice money has landed against.
    return { canceled: false, skipped: "already_paid" };
  }
  if (inv.status === "CANCELED") return { canceled: true, skipped: "already_canceled" };
  await squareFetch(`/v2/invoices/${invoiceId}/cancel`, { version: inv.version });
  console.log(`[square] canceled invoice ${invoiceId} (was ${inv.status})`);
  return { canceled: true };
}

/**
 * Resolve the captured payment id for a paid invoice. Square does NOT populate
 * invoice.payment_requests[].computed_payment_data.payment_ids in our API
 * version (it's empty even on PAID invoices), so we resolve the payment through
 * the invoice's Order tenders (order.tenders[].payment_id). Returns null only
 * when there is genuinely no captured payment.
 */
async function getInvoicePaymentId(invoiceId) {
  const inv = await squareFetch(`/v2/invoices/${invoiceId}`, null, "GET");
  // Prefer the documented field in case a future API version populates it.
  const direct = inv.invoice?.payment_requests?.[0]?.computed_payment_data?.payment_ids?.[0];
  if (direct) return direct;
  const orderId = inv.invoice?.order_id;
  if (!orderId) return null;
  const ord = await squareFetch(`/v2/orders/${orderId}`, null, "GET");
  const tenders = ord.order?.tenders || [];
  const tender = tenders.find((t) => t.payment_id) || tenders[0];
  return tender?.payment_id || tender?.id || null;
}

/**
 * Refund an arbitrary amount against a booking's payment. Used by the
 * cancellation flow for either a full refund (rental + deposit) or a partial
 * deposit-only refund — the amount is the only difference. Simulates when
 * Square isn't configured or the invoice is a simulated (SIM-) one.
 */
async function refundInvoiceAmount({ invoiceId, bookingId, amount, reason }) {
  const amt = Number(amount) || 0;
  if (amt <= 0) return { refundId: null, simulated: true, amount: 0 };

  if (!isSquareConfigured() || String(invoiceId || "").startsWith("SIM-")) {
    const refundId = `SIM-REF-${bookingId}-${randomUUID().slice(0, 8)}`;
    console.log(
      `[square:SIMULATED] Would refund $${amt.toFixed(2)} for booking #${bookingId} ` +
        `(${reason}) → refundId=${refundId}`
    );
    return { refundId, simulated: true, amount: amt };
  }

  const paymentId = await getInvoicePaymentId(invoiceId);
  if (!paymentId) {
    // The invoice is marked paid but Square has no captured payment (e.g. it was
    // "Mark as paid"-ed manually, or paid by cash/check). Don't throw — there's
    // simply nothing to refund through Square. The caller decides how to proceed.
    console.warn(
      `[square] No captured payment on invoice ${invoiceId} for booking #${bookingId} — nothing to refund.`
    );
    return { refundId: null, simulated: false, amount: 0, noPayment: true };
  }
  const refund = await squareFetch("/v2/refunds", {
    idempotency_key: randomUUID(),
    payment_id: paymentId,
    amount_money: { amount: dollarsToCents(amt), currency: "USD" },
    reason,
  });
  return { refundId: refund.refund?.id, simulated: false, amount: amt };
}

export async function refundPayment(booking, amountDollars, reason = "Booking cancellation refund") {
  return refundInvoiceAmount({
    invoiceId: booking.square_invoice_id,
    bookingId: booking.id,
    amount: amountDollars,
    reason,
  });
}

/**
 * Refund the cleaning deposit (or a partial amount of it). Defaults to the full
 * deposit. Shares the same payment-lookup + simulation + no-payment handling as
 * refundPayment.
 */
export async function refundDeposit(booking, amountDollars = booking.deposit) {
  return refundPayment(booking, amountDollars, "Cleaning deposit refund");
}

/**
 * Refund a recurring series' standalone deposit, against its dedicated deposit
 * invoice (deposit_invoice_id on the holder) — not the rental invoice.
 */
export async function refundSeriesDeposit(holder, amountDollars = holder.deposit) {
  return refundInvoiceAmount({
    invoiceId: holder.deposit_invoice_id,
    bookingId: holder.id,
    amount: amountDollars,
    reason: "Recurring series cleaning deposit refund",
  });
}

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
  const depositCents = dollarsToCents(booking.deposit);

  if (!isSquareConfigured()) {
    // ---- Simulated path ----
    const invoiceId = `SIM-INV-${booking.id}-${randomUUID().slice(0, 8)}`;
    const paymentLink = `${process.env.APP_URL || "http://localhost:3000"}/pay/${invoiceId}`;
    console.log(
      `[square:SIMULATED] Would create invoice for booking #${booking.id}:\n` +
        `   • Space rental: $${(rentalCents / 100).toFixed(2)}\n` +
        `   • Refundable cleaning deposit: $${(depositCents / 100).toFixed(2)}\n` +
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
  const order = await squareFetch("/v2/orders", {
    idempotency_key: randomUUID(),
    order: {
      location_id: LOCATION_ID,
      customer_id: customerId,
      line_items: [
        {
          name: "Space rental — The Alley On Center",
          quantity: "1",
          base_price_money: { amount: rentalCents, currency: "USD" },
        },
        {
          name: "Refundable cleaning deposit",
          quantity: "1",
          base_price_money: { amount: depositCents, currency: "USD" },
        },
      ],
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
 * Refund the deposit. In a full build this refunds the specific deposit line
 * item's payment; for the prototype we refund by amount and simulate when no
 * keys are present.
 */
export async function refundDeposit(booking) {
  if (!isSquareConfigured() || String(booking.square_invoice_id || "").startsWith("SIM-")) {
    const refundId = `SIM-REF-${booking.id}-${randomUUID().slice(0, 8)}`;
    console.log(
      `[square:SIMULATED] Would refund deposit of $${Number(booking.deposit).toFixed(
        2
      )} for booking #${booking.id} → refundId=${refundId}`
    );
    return { refundId, simulated: true };
  }

  // Look up the invoice's payment, then issue a refund for the deposit amount.
  const inv = await squareFetch(`/v2/invoices/${booking.square_invoice_id}`, null, "GET");
  const paymentId = inv.invoice?.payment_requests?.[0]?.computed_payment_data?.payment_ids?.[0];
  const refund = await squareFetch("/v2/refunds", {
    idempotency_key: randomUUID(),
    payment_id: paymentId,
    amount_money: { amount: dollarsToCents(booking.deposit), currency: "USD" },
    reason: "Cleaning deposit refund",
  });
  return { refundId: refund.refund?.id, simulated: false };
}

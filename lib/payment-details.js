import { db } from "./db.js";
import { invoicePayment, isSquareConfigured } from "./square.js";

/**
 * How each paid Square invoice was paid (server-only), kept so a customer's
 * Activity can say "Visa •••• 4242" with a receipt link without asking Square
 * every time. Filled when a payment lands (confirmBookingPaid, the bill
 * checks), nightly for anything missed, and on the Activity page for the
 * person looking. Never more than a card's brand and last four.
 */

export function paymentDetails(invoiceIds) {
  const ids = [...new Set(invoiceIds.filter(Boolean))];
  if (!ids.length) return {};
  const rows = db.prepare(`SELECT * FROM invoice_payments WHERE invoice_id IN (${ids.map(() => "?").join(",")})`).all(...ids);
  return Object.fromEntries(rows.map((r) => [r.invoice_id, r]));
}

/** Ask Square how one invoice was paid and keep it. Never throws. */
export async function rememberPayment(invoiceId) {
  try {
    const d = await invoicePayment(invoiceId);
    if (!d) return false;
    db.prepare(
      `INSERT INTO invoice_payments
         (invoice_id, payment_id, method, card_brand, last4, receipt_url, receipt_number, invoice_url, invoice_number, amount, paid_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(invoice_id) DO UPDATE SET
         payment_id = excluded.payment_id, method = excluded.method, card_brand = excluded.card_brand,
         last4 = excluded.last4, receipt_url = excluded.receipt_url, receipt_number = excluded.receipt_number,
         invoice_url = excluded.invoice_url, invoice_number = excluded.invoice_number, amount = excluded.amount,
         paid_at = excluded.paid_at, fetched_at = datetime('now')`
    ).run(
      invoiceId,
      d.paymentId,
      d.method,
      d.cardBrand,
      d.last4,
      d.receiptUrl,
      d.receiptNumber,
      d.invoiceUrl,
      d.invoiceNumber,
      d.amount,
      d.paidAt
    );
    return true;
  } catch (err) {
    console.error(`[payment-details] ${invoiceId}:`, err.message);
    return false;
  }
}

/** Every paid invoice the site made that we don't have the details of yet. */
function missing() {
  return db
    .prepare(
      `SELECT id FROM (
         SELECT square_invoice_id AS id FROM bookings WHERE payment_status IN ('paid', 'refunded')
         UNION SELECT deposit_invoice_id FROM bookings WHERE deposit_payment_status IN ('paid', 'refunded')
         UNION SELECT square_invoice_id FROM staff_cost_shares WHERE status = 'paid'
         UNION SELECT square_invoice_id FROM share_bills WHERE status = 'paid'
       )
       WHERE id IS NOT NULL AND id NOT LIKE 'SIM-%' AND id NOT IN (SELECT invoice_id FROM invoice_payments)`
    )
    .all()
    .map((r) => r.id);
}

/**
 * Fill in what's missing, `limit` at a time — of `only` (one person's
 * invoices) when given. Gives up after `ms` so a slow Square never holds a
 * page; whatever didn't finish is picked up next time.
 */
export async function fillMissingPayments({ only = null, limit = 40, ms = 0 } = {}) {
  if (!isSquareConfigured()) return { filled: 0, left: 0 };
  let ids = missing();
  if (only) {
    const want = new Set(only.filter(Boolean));
    ids = ids.filter((id) => want.has(id));
  }
  const batch = ids.slice(0, limit);
  if (!batch.length) return { filled: 0, left: 0 };
  const work = Promise.all(batch.map((id) => rememberPayment(id)));
  const done = ms ? await Promise.race([work, new Promise((r) => setTimeout(() => r(null), ms))]) : await work;
  const filled = done ? done.filter(Boolean).length : 0;
  return { filled, left: ids.length - filled };
}

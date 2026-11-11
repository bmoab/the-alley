import { db } from "./db.js";
import { createSimpleInvoice, cancelInvoice, getInvoiceStatus, isSquareConfigured, refundPayment } from "./square.js";
import { rememberPayment } from "./payment-details.js";
import { shiftDate, venueToday } from "./constants.js";

/**
 * Money on a booking after it was paid (server-only).
 *
 * A paid booking's invoice can't be changed, so when time is added later the
 * difference goes out on its own Square invoice (kind 'charge'), and when time
 * is taken off the difference can be refunded (kind 'refund'). The booking's
 * own hours and total always say what the booking is now; these rows say how
 * the money caught up.
 */

export function listCharges(bookingId) {
  return db.prepare("SELECT * FROM booking_charges WHERE booking_id = ? ORDER BY id").all(Number(bookingId));
}

/**
 * Bill `amount` more on a paid booking: its own Square invoice, due in 3 days
 * (or the day before the event, if that's sooner, but never before today).
 * Returns the saved row ({ payment_link, … }).
 */
export async function chargeBooking(booking, amount, { description }) {
  const amt = Math.round(Number(amount) * 100) / 100;
  if (!(amt > 0)) throw new Error("Nothing to charge.");
  const id = db
    .prepare("INSERT INTO booking_charges (booking_id, kind, amount, description, status) VALUES (?, 'charge', ?, ?, 'sending')")
    .run(booking.id, amt, description).lastInsertRowid;
  const today = venueToday();
  const dayBefore = shiftDate(booking.date, { days: -1 });
  const inThree = shiftDate(today, { days: 3 });
  const due = dayBefore < inThree ? (dayBefore > today ? dayBefore : today) : inThree;
  try {
    const inv = await createSimpleInvoice({
      key: `alley-bkcharge-${id}`,
      name: booking.client_name,
      email: booking.client_email,
      // "Space rental" keeps it with rentals in the Square sales sync.
      lineName: `Space rental — ${description}`,
      title: "The Alley On Center — added time",
      amount: amt,
      dueDate: due,
    });
    db.prepare("UPDATE booking_charges SET status = 'sent', square_invoice_id = ?, payment_link = ? WHERE id = ?").run(
      inv.invoiceId,
      inv.paymentLink,
      id
    );
  } catch (err) {
    db.prepare("UPDATE booking_charges SET status = 'cancelled' WHERE id = ?").run(id);
    throw err;
  }
  return db.prepare("SELECT * FROM booking_charges WHERE id = ?").get(id);
}

/** Void a booking's unpaid extra invoices (cancelled booking, or time taken back off). Returns how many. */
export async function cancelOpenCharges(bookingId) {
  const open = db.prepare("SELECT * FROM booking_charges WHERE booking_id = ? AND kind = 'charge' AND status = 'sent'").all(Number(bookingId));
  for (const c of open) {
    if (c.square_invoice_id) {
      const r = await cancelInvoice(c.square_invoice_id);
      if (r?.skipped === "already_paid") {
        markChargePaid(c.id);
        continue;
      }
    }
    db.prepare("UPDATE booking_charges SET status = 'cancelled' WHERE id = ?").run(c.id);
  }
  return open.length;
}

export function markChargePaid(id) {
  db.prepare("UPDATE booking_charges SET status = 'paid', paid_at = ? WHERE id = ? AND status != 'paid'").run(new Date().toISOString(), id);
}

export function getChargeByInvoice(invoiceId) {
  return db.prepare("SELECT * FROM booking_charges WHERE square_invoice_id = ?").get(invoiceId);
}

/** Nightly + webhook backstop: mark extra-time invoices paid that Square says are paid. */
export async function refreshChargePayments() {
  if (!isSquareConfigured()) return { checked: 0, paid: 0 };
  const open = db.prepare("SELECT id, square_invoice_id FROM booking_charges WHERE status = 'sent' AND square_invoice_id IS NOT NULL").all();
  let paid = 0;
  for (const c of open) {
    try {
      if ((await getInvoiceStatus(c.square_invoice_id)) === "paid") {
        markChargePaid(c.id);
        await rememberPayment(c.square_invoice_id);
        paid++;
      }
    } catch (err) {
      console.error("[booking-charges] status check failed:", err.message);
    }
  }
  return { checked: open.length, paid };
}

/**
 * Refund `amount` on a booking whose money may be spread over more than one
 * invoice: paid extra-time invoices first (newest first, up to what each
 * took), then the booking's own invoice. Returns { refunded, noPayment }.
 */
export async function refundAcrossInvoices(booking, amount, reason) {
  let left = Math.round(Number(amount) * 100) / 100;
  let refunded = 0;
  let noPayment = false;
  const paid = db
    .prepare("SELECT * FROM booking_charges WHERE booking_id = ? AND kind = 'charge' AND status = 'paid' ORDER BY id DESC")
    .all(booking.id);
  for (const c of paid) {
    if (left <= 0) break;
    const room = Math.round((c.amount - c.refunded) * 100) / 100;
    if (room <= 0) continue;
    const take = Math.min(room, left);
    const r = await refundPayment({ id: booking.id, square_invoice_id: c.square_invoice_id }, take, reason);
    if (r?.noPayment) continue;
    db.prepare("UPDATE booking_charges SET refunded = refunded + ? WHERE id = ?").run(take, c.id);
    left = Math.round((left - take) * 100) / 100;
    refunded += take;
  }
  if (left > 0) {
    const r = await refundPayment(booking, left, reason);
    if (r?.noPayment) noPayment = true;
    else refunded += left;
  }
  return { refunded: Math.round(refunded * 100) / 100, noPayment };
}

/** Record a refund for time taken off (the money itself goes through refundAcrossInvoices). */
export function recordRefund(bookingId, amount, description) {
  db.prepare("INSERT INTO booking_charges (booking_id, kind, amount, description, status, paid_at) VALUES (?, 'refund', ?, ?, 'done', ?)").run(
    bookingId,
    amount,
    description,
    new Date().toISOString()
  );
}

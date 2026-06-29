import { db } from "./db.js";
import { getBooking } from "./bookings.js";
import { refundDeposit } from "./square.js";
import { emailOwnerDepositReminder, emailClientDepositResolved } from "./email.js";
import { logActivity, logEmail } from "./activity.js";
import { formatMoney } from "./constants.js";

const SYSTEM = { actorUserId: null, actorName: "system" };
const OWNER_EMAIL = process.env.OWNER_EMAIL || "thealleyoncenter@gmail.com";

/**
 * Deposit refund tracking (build priority 9).
 *
 * A booking needs deposit resolution when it's paid, its event date has passed,
 * it still has a deposit, and the deposit hasn't been refunded/withheld yet.
 * The owner sees these in the admin Deposits queue and either refunds (Square)
 * or withholds. Reminder emails go out on days 1–3 after the event until
 * resolved.
 */

const todayYmd = () => new Date().toISOString().slice(0, 10);

/** Whole days from a YYYY-MM-DD event date to `now` (>=0 means in the past). */
function daysSince(ymd, now = new Date()) {
  const [y, m, d] = ymd.split("-").map(Number);
  const event = Date.UTC(y, m - 1, d);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((today - event) / 86400000);
}

export function listDepositsToRefund() {
  return db
    .prepare(
      `SELECT * FROM bookings
        WHERE payment_status = 'paid'
          AND status IN ('confirmed', 'completed')
          AND deposit > 0
          AND (deposit_status IS NULL OR deposit_status = 'pending')
          AND date < ?
        ORDER BY date ASC`
    )
    .all(todayYmd());
}

/**
 * Resolve a deposit by refunding a chosen amount (0..deposit). The remainder is
 * recorded as withheld, with an optional reason (e.g. damage). Refund == full
 * deposit → fully refunded; refund == 0 → fully withheld; in between → partial.
 * Issues the Square refund for the refunded portion, records the outcome, emails
 * the client, and logs it. Returns { booking, noPayment, refunded, withheld }.
 */
export async function resolveDeposit(id, { refundAmount, reason } = {}, actor = SYSTEM) {
  const booking = getBooking(id);
  if (!booking) return null;

  const deposit = Math.round((Number(booking.deposit) || 0) * 100) / 100;
  const refunded = Math.round(Math.max(0, Math.min(deposit, Number(refundAmount) || 0)) * 100) / 100;
  const withheld = Math.round((deposit - refunded) * 100) / 100;
  const reasonText = (reason || "").trim() || null;

  // Issue the Square refund for the refunded portion (skip if withholding all).
  let noPayment = false;
  if (refunded > 0) {
    const res = await refundDeposit(booking, refunded); // may throw on real API error → caller catches
    noPayment = Boolean(res?.noPayment);
  }

  const status = refunded > 0 ? "refunded" : "withheld";
  db.prepare(
    "UPDATE bookings SET deposit_status = ?, deposit_refunded = ?, deposit_reason = ?, status = 'completed' WHERE id = ?"
  ).run(status, refunded, reasonText, id);

  const partial = refunded > 0 && withheld > 0;
  const desc =
    refunded <= 0
      ? `Deposit withheld · ${formatMoney(deposit)}${reasonText ? ` — ${reasonText}` : ""}`
      : `Deposit refunded · ${formatMoney(refunded)}` +
        (partial ? ` (kept ${formatMoney(withheld)}${reasonText ? ` — ${reasonText}` : ""})` : "") +
        (noPayment ? " · no Square payment found (refund manually)" : "");
  logActivity({
    bookingId: id,
    eventType: refunded > 0 ? "deposit_refunded" : "deposit_withheld",
    description: desc,
    amount: refunded > 0 ? refunded : deposit,
    metadata: { refunded, withheld, reason: reasonText, no_payment_found: noPayment },
    ...actor,
  });
  console.log(
    `[deposits] Resolved deposit for #${id}: refunded $${refunded}, withheld $${withheld}` +
      (noPayment ? " (no Square payment — refund manually)" : "")
  );

  // Let the client know their deposit was resolved (refund and/or withhold).
  try {
    const res = await emailClientDepositResolved(getBooking(id), { refunded, withheld, reason: reasonText });
    logEmail({
      bookingId: id,
      eventType: "deposit_resolved_sent",
      description: refunded > 0 ? "Deposit refund email sent" : "Deposit decision email sent",
      recipientEmail: booking.client_email,
      amount: refunded > 0 ? refunded : null,
      sendResult: res,
    });
  } catch (err) {
    console.error(`[deposits] client deposit email failed for #${id}:`, err.message);
  }

  return { booking: getBooking(id), noPayment, refunded, withheld };
}

function reminderAlreadySent(bookingId, dayNumber) {
  return Boolean(
    db
      .prepare(
        "SELECT 1 FROM deposit_reminders WHERE booking_id = ? AND day_number = ?"
      )
      .get(bookingId, dayNumber)
  );
}

/**
 * Send any due deposit reminders for unresolved deposits, starting the day
 * after the event and continuing daily until the owner refunds or withholds
 * (resolved deposits drop out of listDepositsToRefund automatically).
 * Idempotent: at most one email per booking per day. Returns the number of
 * reminders sent. A real cron hits this at 9 AM daily; we also run it lazily
 * when the owner opens the Deposits page.
 */
export async function runDepositReminders(now = new Date()) {
  const pending = listDepositsToRefund();
  let sent = 0;
  for (const b of pending) {
    const day = daysSince(b.date, now);
    if (day >= 1 && !reminderAlreadySent(b.id, day)) {
      try {
        const res = await emailOwnerDepositReminder(b, day);
        db.prepare(
          "INSERT INTO deposit_reminders (booking_id, day_number) VALUES (?, ?)"
        ).run(b.id, day);
        logEmail({
          bookingId: b.id,
          eventType: "deposit_reminder_sent",
          description: `Deposit refund reminder sent (day ${day})`,
          recipientEmail: OWNER_EMAIL,
          sendResult: res,
          ...SYSTEM,
        });
        sent++;
      } catch (err) {
        console.error(`[deposits] reminder email failed for #${b.id}:`, err.message);
      }
    }
  }
  return sent;
}

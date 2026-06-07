import { db } from "./db.js";
import { getBooking } from "./bookings.js";
import { refundDeposit } from "./square.js";
import { emailOwnerDepositReminder } from "./email.js";

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

/** Resolve a deposit: action is "refund" or "withhold". Stops reminders. */
export async function resolveDeposit(id, action) {
  const booking = getBooking(id);
  if (!booking) return null;

  if (action === "refund") {
    try {
      const { refundId, simulated } = await refundDeposit(booking);
      console.log(
        `[deposits] Refunded $${booking.deposit} for booking #${id}` +
          (simulated ? " (simulated)" : ` (Square refund ${refundId})`)
      );
    } catch (err) {
      console.error(`[deposits] refund failed for #${id}:`, err.message);
      throw err;
    }
    db.prepare(
      "UPDATE bookings SET deposit_status = 'refunded', status = 'completed' WHERE id = ?"
    ).run(id);
  } else {
    db.prepare(
      "UPDATE bookings SET deposit_status = 'withheld', status = 'completed' WHERE id = ?"
    ).run(id);
    console.log(`[deposits] Withheld $${booking.deposit} for booking #${id}`);
  }
  return getBooking(id);
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
 * Send any due deposit reminders (days 1–3 after the event) for unresolved
 * deposits. Idempotent: at most one email per booking per day. Returns the
 * number of reminders sent. A real cron hits this at 11 AM daily; we also run
 * it lazily when the owner opens the Deposits page.
 */
export async function runDepositReminders(now = new Date()) {
  const pending = listDepositsToRefund();
  let sent = 0;
  for (const b of pending) {
    const day = daysSince(b.date, now);
    if (day >= 1 && day <= 3 && !reminderAlreadySent(b.id, day)) {
      try {
        await emailOwnerDepositReminder(b, day);
        db.prepare(
          "INSERT INTO deposit_reminders (booking_id, day_number) VALUES (?, ?)"
        ).run(b.id, day);
        sent++;
      } catch (err) {
        console.error(`[deposits] reminder email failed for #${b.id}:`, err.message);
      }
    }
  }
  return sent;
}

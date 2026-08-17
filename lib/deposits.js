import { db } from "./db.js";
import { getBooking } from "./bookings.js";
import { refundDeposit, refundSeriesDeposit } from "./square.js";
import { emailOwnerDepositReminder, emailClientDepositResolved } from "./email.js";
import { logActivity, logEmail } from "./activity.js";
import { formatMoney, venueToday, venueNow } from "./constants.js";
import { requestRecipients, recipientLabel } from "./notify.js";

const SYSTEM = { actorUserId: null, actorName: "system" };

/**
 * Deposit refund tracking (build priority 9).
 *
 * A booking needs deposit resolution when it's paid, its event date has passed,
 * it still has a deposit, and the deposit hasn't been refunded/withheld yet.
 * The owner sees these in the admin Deposits queue and either refunds (Square)
 * or withholds. Reminder emails go out on days 1–3 after the event until
 * resolved.
 */

/** Whole days from a YYYY-MM-DD event date to `now`, venue-local (>=0 = past). */
function daysSince(ymd, now = new Date()) {
  const [y, m, d] = ymd.split("-").map(Number);
  const [ty, tm, td] = venueToday(now).split("-").map(Number);
  return Math.floor((Date.UTC(ty, tm - 1, td) - Date.UTC(y, m - 1, d)) / 86400000);
}

// The moment a booking row finishes, as a SQLite datetime: its venue-local
// start plus its duration. `hours` is a REAL (2.5 is legal), so it's converted
// to whole minutes.
const ENDS_AT = (t = "") =>
  `datetime(${t}date || ' ' || ${t}start_time, '+' || CAST(ROUND(${t}hours * 60) AS INTEGER) || ' minutes')`;

/**
 * Deposits ready to resolve: everything whose event has actually FINISHED.
 *
 * This used to compare `date < today` with `today` taken from
 * `new Date().toISOString()` — i.e. UTC. Two problems, in opposite directions:
 * the server's UTC date runs ahead of Denver from ~6 PM, so an evening event
 * showed up as resolvable while it was still running; and a morning event
 * wasn't resolvable until 6 PM that day even though the room was long empty.
 *
 * Now the gate is the event's own end time in venue-local wall clock, so a
 * deposit becomes resolvable the moment the space clears — which is exactly
 * when the owner is standing in it — and never a minute before.
 *
 * Reminder emails are unaffected: they still start the day AFTER the event
 * (see runDepositReminders), so resolving on the night is simply the owner
 * getting there first.
 */
export function listDepositsToRefund(now = new Date()) {
  const stamp = venueNow(now);
  // Single bookings: deposit (on the rental invoice) resolves after the event.
  const singles = db
    .prepare(
      `SELECT * FROM bookings
        WHERE series_id IS NULL
          AND payment_status = 'paid'
          AND status IN ('confirmed', 'completed')
          AND deposit > 0
          AND (deposit_status IS NULL OR deposit_status = 'pending')
          AND ${ENDS_AT()} <= datetime(?)`
    )
    .all(stamp);
  // Recurring series: ONE deposit on the holder (separate invoice), resolved
  // once the LAST still-standing session has finished. Falls back to the
  // recorded series_end_date (end of day) if every session was cancelled, so a
  // paid deposit can't get stranded.
  const series = db
    .prepare(
      `SELECT b.* FROM bookings b
        WHERE b.series_id IS NOT NULL
          AND b.is_deposit_holder = 1
          AND b.deposit > 0
          AND b.deposit_payment_status = 'paid'
          AND (b.deposit_status IS NULL OR b.deposit_status = 'pending')
          AND COALESCE(
                (SELECT ${ENDS_AT("s.")} FROM bookings s
                  WHERE s.series_id = b.series_id
                    AND s.status IN ('reserved', 'held', 'confirmed', 'completed')
                  ORDER BY s.date DESC, s.start_time DESC
                  LIMIT 1),
                datetime(b.series_end_date || ' 23:59')
              ) <= datetime(?)`
    )
    .all(stamp);
  return [...singles, ...series].sort((a, b) =>
    (a.series_end_date || a.date) < (b.series_end_date || b.date) ? -1 : 1
  );
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
  // A series deposit lives on its own deposit invoice → refundSeriesDeposit.
  let noPayment = false;
  if (refunded > 0) {
    const res = booking.series_id
      ? await refundSeriesDeposit(booking, refunded)
      : await refundDeposit(booking, refunded); // may throw on real API error → caller catches
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
  const pending = listDepositsToRefund(now);
  let sent = 0;
  for (const b of pending) {
    // Series deposits are due after the LAST session, so count from series end.
    const refDate = b.series_id ? b.series_end_date || b.date : b.date;
    const day = daysSince(refDate, now);
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
          recipientEmail: recipientLabel(requestRecipients()),
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

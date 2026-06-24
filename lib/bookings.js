import { db, getSetting } from "./db.js";
import { BLOCKING_STATUSES, getEventStart } from "./constants.js";
import { getClosureIntervals } from "./closures.js";

/**
 * Booking pricing + availability helpers.
 * Double-booking prevention lives here (section 4 of the brief).
 */

/** Compute total = rate * hours * sessions + deposit. */
export function computeTotal({ rate, hours, sessions = 1, deposit }) {
  const r = Number(rate) || 0;
  const h = Number(hours) || 0;
  const s = Number(sessions) || 1;
  const d = Number(deposit) || 0;
  return Math.round((r * h * s + d) * 100) / 100;
}

/** Convert "HH:MM" to a fractional hour number (e.g. "13:30" -> 13.5). */
function toHour(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h + (m || 0) / 60;
}

/**
 * The earliest bookable start (as a fractional hour-of-day) for `date`
 * (YYYY-MM-DD), in America/Denver. Combines two rules: can't book the past, and
 * the configurable `min_lead_hours` advance notice. The cutoff = now + lead.
 *   - returns null  → `date` is far enough out; no time-of-day restriction.
 *   - returns 24    → the whole day is too soon; nothing on it is bookable.
 *   - returns H.MM  → the cutoff lands within `date`; starts before H are blocked.
 * Server runs in UTC, so we compare against Denver wall-clock time.
 */
function earliestBookableHour(date) {
  const leadHours = Number(getSetting("min_lead_hours", "0")) || 0;
  const cutoff = new Date(Date.now() + leadHours * 3600 * 1000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Denver",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(cutoff);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  const cutoffDate = `${p.year}-${p.month}-${p.day}`;
  if (date > cutoffDate) return null; // far enough out
  if (date < cutoffDate) return 24; // entire day already too soon
  const hour = Number(p.hour) % 24; // some platforms emit "24" at midnight
  return hour + Number(p.minute) / 60;
}

/**
 * True if a start at `startTime` on `date` is too soon to book — either already
 * passed, or inside the configured advance-notice window.
 */
export function isStartTooSoon(date, startTime) {
  const earliest = earliestBookableHour(date);
  return earliest != null && toHour(startTime) < earliest;
}

/**
 * Return the occupied intervals [startHour, endHour) for a space on a date,
 * including the cleanup buffer applied after each booking. Used to disable
 * already-taken start times in the client booking flow.
 */
export function getOccupiedIntervals(space, date) {
  const placeholders = BLOCKING_STATUSES.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT start_time, hours FROM bookings
       WHERE space = ? AND date = ? AND status IN (${placeholders})`
    )
    .all(space, date, ...BLOCKING_STATUSES);

  const bufferHours = (Number(getSetting("cleanup_buffer_minutes", "60")) || 0) / 60;

  return rows.map((r) => {
    const start = toHour(r.start_time);
    const end = start + Number(r.hours) + bufferHours;
    return { start, end };
  });
}

/**
 * All intervals that block a new booking: buffered existing bookings PLUS owner
 * closures (hard blocks, no buffer). Used by every server-side availability check.
 */
export function getBlockedIntervals(space, date) {
  return [...getOccupiedIntervals(space, date), ...getClosureIntervals(space, date)];
}

/**
 * Given a space/date, return which start times (open..close) are available for
 * a booking of `hours` length, at 30-minute increments. Returns an array of
 * { time: "HH:MM", available: boolean }.
 */
export function getAvailableStartTimes(space, date, hours = 2) {
  const openHour = Number(getSetting("open_hour", "8"));
  const closeHour = Number(getSetting("close_hour", "23"));
  const occupied = getBlockedIntervals(space, date);
  const duration = Number(hours) || 2;
  const earliest = earliestBookableHour(date); // past + advance-notice cutoff

  const slots = [];
  // Step by 0.5h. Use a small epsilon so floating-point sums don't drop the
  // last legitimate slot (e.g. 21 + 2 <= 23).
  for (let h = openHour; h + duration <= closeHour + 1e-9; h += 0.5) {
    const slotStart = h;
    const slotEnd = h + duration;
    // A slot is available if it overlaps no occupied interval and isn't too soon
    // (already passed, or inside the advance-notice window).
    const conflict = occupied.some(
      (iv) => slotStart < iv.end && slotEnd > iv.start
    );
    const past = earliest != null && slotStart < earliest;
    const hh = Math.floor(h);
    const mm = h - hh >= 0.5 ? "30" : "00";
    const time = `${String(hh).padStart(2, "0")}:${mm}`;
    slots.push({ time, available: !conflict && !past });
  }
  return slots;
}

/**
 * Lightweight day summary for the booking calendar dots: how many start times
 * are open for a `hours`-long booking on a given date. Returns { open, total }.
 */
export function getDayAvailability(space, date, hours = 2) {
  const slots = getAvailableStartTimes(space, date, hours);
  const open = slots.filter((s) => s.available).length;
  return { open, total: slots.length };
}

/**
 * Raw blocking bookings for a space/date as fractional-hour intervals
 * [{ start, end }] (no buffer applied — the client adds the cleanup buffer for
 * the smart start-time + duration picker).
 */
export function getDayBookings(space, date) {
  const placeholders = BLOCKING_STATUSES.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT start_time, hours FROM bookings
       WHERE space = ? AND date = ? AND status IN (${placeholders})`
    )
    .all(space, date, ...BLOCKING_STATUSES);
  return rows.map((r) => {
    const start = toHour(r.start_time);
    return { start, end: start + Number(r.hours) };
  });
}

/**
 * Per-30-minute freeness for a whole day, used by the range time-picker. Returns
 * an array covering open_hour..close_hour in 30-min steps; each item is the
 * block STARTING at `time`, with `free` = it doesn't overlap a booked interval
 * (incl. the cleanup buffer). The final item is the close time (a valid END
 * only, `free` false) so the picker can offer "until close".
 */
export function getDayFreeSlots(space, date) {
  const openHour = Number(getSetting("open_hour", "8"));
  const closeHour = Number(getSetting("close_hour", "23"));
  const occupied = getBlockedIntervals(space, date);
  const earliest = earliestBookableHour(date);
  const slots = [];
  for (let h = openHour; h <= closeHour + 1e-9; h += 0.5) {
    const hh = Math.floor(h);
    const mm = h - hh >= 0.5 ? "30" : "00";
    const time = `${String(hh).padStart(2, "0")}:${mm}`;
    if (h >= closeHour - 1e-9) {
      slots.push({ time, free: false, isEnd: true });
      break;
    }
    // Free if this 30-min block overlaps no occupied interval and isn't too soon.
    const past = earliest != null && h < earliest;
    const free = !past && !occupied.some((iv) => h < iv.end && h + 0.5 > iv.start);
    slots.push({ time, free });
  }
  return slots;
}

/**
 * Authoritative check used at submit time to prevent a race / double-book.
 * Returns true if the requested slot is free.
 */
export function isSlotAvailable(space, date, startTime, hours) {
  if (isStartTooSoon(date, startTime)) return false; // passed, or inside advance window
  const occupied = getBlockedIntervals(space, date);
  const start = toHour(startTime);
  const end = start + (Number(hours) || 0);
  return !occupied.some((iv) => start < iv.end && end > iv.start);
}

/** Insert a new pending booking request. Returns the new row id. */
export function createBookingRequest(data) {
  const rate = Number(getSetting("standard_rate", "75"));
  const deposit = Number(getSetting("deposit", "150"));
  const total = computeTotal({
    rate,
    hours: data.hours,
    sessions: 1,
    deposit,
  });

  const stmt = db.prepare(`
    INSERT INTO bookings (
      space, date, start_time, hours, status,
      client_name, client_email, client_phone,
      event_type, guests, alcohol, notes,
      is_recurring, recurring_schedule, is_public_event,
      rate, sessions, deposit, total
    ) VALUES (
      @space, @date, @start_time, @hours, 'pending',
      @client_name, @client_email, @client_phone,
      @event_type, @guests, @alcohol, @notes,
      @is_recurring, @recurring_schedule, @is_public_event,
      @rate, 1, @deposit, @total
    )
  `);

  const info = stmt.run({
    space: data.space,
    date: data.date,
    start_time: data.start_time,
    hours: Number(data.hours),
    client_name: data.client_name,
    client_email: data.client_email,
    client_phone: data.client_phone,
    event_type: data.event_type ?? null,
    guests: data.guests ?? null,
    alcohol: data.alcohol ? 1 : 0,
    notes: data.notes ?? null,
    is_recurring: data.is_recurring ? 1 : 0,
    recurring_schedule: data.recurring_schedule ?? null,
    is_public_event: data.is_public_event ? 1 : 0,
    rate,
    deposit,
    total,
  });
  return info.lastInsertRowid;
}

export function getBooking(id) {
  return db.prepare("SELECT * FROM bookings WHERE id = ?").get(id);
}

export function getBookingByInvoice(invoiceId) {
  return db
    .prepare("SELECT * FROM bookings WHERE square_invoice_id = ?")
    .get(invoiceId);
}

/**
 * List bookings. Omit `status` (or pass "all") to return every booking,
 * including denied/cancelled — used by the admin All Requests / history view.
 * `sort` is "date_asc" (default) or "date_desc".
 */
export function listBookings({ status, space, sort = "date_asc" } = {}) {
  let sql = "SELECT * FROM bookings";
  const where = [];
  const params = [];
  if (status && status !== "all") {
    where.push("status = ?");
    params.push(status);
  }
  if (space) {
    where.push("space = ?");
    params.push(space);
  }
  if (where.length) sql += " WHERE " + where.join(" AND ");
  const dir = sort === "date_desc" ? "DESC" : "ASC";
  sql += ` ORDER BY date ${dir}, start_time ${dir}`;
  return db.prepare(sql).all(...params);
}

/**
 * Save owner-adjusted pricing on a pending request (rate, hours, sessions,
 * deposit) and recompute the total. Used by the admin Requests view.
 */
export function updateBookingPricing(id, { rate, hours, sessions, deposit }) {
  const r = Number(rate) || 0;
  const h = Number(hours) || 0;
  const s = Math.max(1, Number(sessions) || 1);
  const d = Number(deposit) || 0;
  const total = computeTotal({ rate: r, hours: h, sessions: s, deposit: d });
  db.prepare(
    `UPDATE bookings SET rate = ?, hours = ?, sessions = ?, deposit = ?, total = ?
     WHERE id = ?`
  ).run(r, h, s, d, total, id);
  return total;
}

/**
 * Approve a pending request. Persists any final pricing, places a HELD booking
 * on the calendar (blocks the slot), and sets a payment deadline from the
 * configured payment window.
 *
 * Returns the updated booking row. Square invoice creation + the approval email
 * are layered on in build priorities 5 & 6; this function is the single place
 * those will hook into.
 */
export function approveBooking(id, pricing) {
  if (pricing) updateBookingPricing(id, pricing);

  const windowDays = Number(getSetting("payment_window_days", "3")) || 3;
  const holdExpires = new Date();
  holdExpires.setDate(holdExpires.getDate() + windowDays);
  const holdExpiresIso = holdExpires.toISOString();

  db.prepare(
    `UPDATE bookings
       SET status = 'held', payment_status = 'unpaid', hold_expires_at = ?
     WHERE id = ?`
  ).run(holdExpiresIso, id);

  return getBooking(id);
}

/** Deny a pending request and release any hold. */
export function denyBooking(id) {
  db.prepare(
    "UPDATE bookings SET status = 'denied', hold_expires_at = NULL WHERE id = ?"
  ).run(id);
  return getBooking(id);
}

/** Store the Square invoice id + payment link on a booking. */
export function setInvoiceInfo(id, { invoiceId, paymentLink }) {
  db.prepare(
    "UPDATE bookings SET square_invoice_id = ?, payment_link = ? WHERE id = ?"
  ).run(invoiceId ?? null, paymentLink ?? null, id);
  return getBooking(id);
}

/**
 * Mark a held booking as paid + confirmed. Returns the updated row.
 * (Confirmation email + host-invite are triggered by the caller in priority 7.)
 */
export function markBookingPaid(id) {
  db.prepare(
    "UPDATE bookings SET payment_status = 'paid', status = 'confirmed' WHERE id = ?"
  ).run(id);
  return getBooking(id);
}

/** Expire a held booking whose payment window has passed (releases the slot). */
export function expireBooking(id) {
  db.prepare(
    "UPDATE bookings SET status = 'expired', hold_expires_at = NULL WHERE id = ?"
  ).run(id);
  return getBooking(id);
}

/** Held bookings whose hold_expires_at is in the past and still unpaid. */
export function listExpiredHolds(now = new Date()) {
  return db
    .prepare(
      "SELECT * FROM bookings WHERE status = 'held' AND payment_status != 'paid' AND hold_expires_at IS NOT NULL AND hold_expires_at < ?"
    )
    .all(now.toISOString());
}

// ---------------------------------------------------------------------------
// Restore (un-deny) with conflict check
// ---------------------------------------------------------------------------

/**
 * Check whether restoring `booking` would collide with another active booking.
 * The booking's own slot is expanded by the cleanup buffer on BOTH sides, then
 * tested against every other held/confirmed booking for the same space/date
 * (those are also buffered, via getOccupiedIntervals). Returns the conflicting
 * booking row, or null if the slot is clear.
 */
export function findRestoreConflict(booking) {
  if (!booking) return null;
  const bufferHours =
    (Number(getSetting("cleanup_buffer_minutes", "60")) || 0) / 60;

  const start = toHour(booking.start_time) - bufferHours;
  const end = toHour(booking.start_time) + Number(booking.hours) + bufferHours;

  const others = db
    .prepare(
      `SELECT * FROM bookings
        WHERE space = ? AND date = ? AND id != ?
          AND status IN ('held', 'confirmed')`
    )
    .all(booking.space, booking.date, booking.id);

  for (const o of others) {
    const oStart = toHour(o.start_time);
    const oEnd = oStart + Number(o.hours) + bufferHours; // buffer after the other
    if (start < oEnd && end > oStart) return o; // overlap
  }
  return null;
}

/**
 * Restore a denied booking back to `toStatus` ("pending" by default, or
 * "held"). Caller must run findRestoreConflict first and block on conflict.
 */
export function restoreBooking(id, toStatus = "pending") {
  const status = toStatus === "held" ? "held" : "pending";
  db.prepare(
    "UPDATE bookings SET status = ?, restored_at = datetime('now') WHERE id = ?"
  ).run(status, id);
  return getBooking(id);
}

// ---------------------------------------------------------------------------
// Cancellation & refund (owner-initiated)
// ---------------------------------------------------------------------------

/** Rental-only portion (excludes the refundable deposit). */
export function rentalAmount(booking) {
  return Math.round(
    (Number(booking.rate) || 0) *
      (Number(booking.hours) || 0) *
      Math.max(1, Number(booking.sessions) || 1) *
      100
  ) / 100;
}

/**
 * Quote a cancellation against the configured policy. Returns:
 *   side          "before" | "within"  (relative to the cutoff)
 *   cutoffHours   the configured cutoff
 *   refundType    "full" | "deposit_only" | "none"
 *   refundAmount  dollars to refund
 *   rentalForfeited  dollars of rental the client loses (0 if full refund)
 *   hasPayment    whether there's a captured payment to refund via Square
 */
export function cancellationQuote(booking, now = new Date()) {
  const cutoffHours = Number(getSetting("cancellation_cutoff_hours", "72")) || 72;
  const beforePolicy = getSetting("refund_before_cutoff", "full");
  const withinPolicy = getSetting("refund_within_cutoff", "deposit_only");

  const start = getEventStart(booking);
  const msUntil = start ? start.getTime() - now.getTime() : 0;
  const side = msUntil > cutoffHours * 3600 * 1000 ? "before" : "within";
  const policy = side === "before" ? beforePolicy : withinPolicy;

  const deposit = Number(booking.deposit) || 0;
  const rental = rentalAmount(booking);
  const hasPayment = booking.payment_status === "paid";

  let refundType = policy; // "full" | "deposit_only"
  let refundAmount = policy === "full" ? rental + deposit : deposit;
  let rentalForfeited = policy === "full" ? 0 : rental;

  // Nothing was captured yet (pending/held) → nothing to refund.
  if (!hasPayment) {
    refundType = "none";
    refundAmount = 0;
    rentalForfeited = 0;
  }

  return {
    side,
    cutoffHours,
    refundType,
    refundAmount: Math.round(refundAmount * 100) / 100,
    rentalForfeited: Math.round(rentalForfeited * 100) / 100,
    hasPayment,
    deposit,
    rental,
  };
}

/**
 * Mark a booking cancelled and record the refund. Frees the slot automatically
 * (cancelled is not a blocking status). The actual Square refund is issued by
 * the caller (admin action) before calling this.
 */
export function cancelBooking(id, { refundAmount, refundType, cancelledBy }) {
  db.prepare(
    `UPDATE bookings
       SET status = 'cancelled',
           cancelled_at = datetime('now'),
           cancelled_by = ?,
           refund_amount = ?,
           refund_type = ?,
           payment_status = CASE WHEN ? > 0 THEN 'refunded' ELSE payment_status END,
           hold_expires_at = NULL
     WHERE id = ?`
  ).run(
    cancelledBy ?? null,
    Number(refundAmount) || 0,
    refundType ?? "none",
    Number(refundAmount) || 0,
    id
  );
  return getBooking(id);
}

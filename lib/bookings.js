import { db, getSetting } from "./db.js";
import { BLOCKING_STATUSES } from "./constants.js";

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
 * Given a space/date, return which start times (open..close) are available for
 * a booking of `hours` length, at 30-minute increments. Returns an array of
 * { time: "HH:MM", available: boolean }.
 */
export function getAvailableStartTimes(space, date, hours = 2) {
  const openHour = Number(getSetting("open_hour", "8"));
  const closeHour = Number(getSetting("close_hour", "23"));
  const occupied = getOccupiedIntervals(space, date);
  const duration = Number(hours) || 2;

  const slots = [];
  // Step by 0.5h. Use a small epsilon so floating-point sums don't drop the
  // last legitimate slot (e.g. 21 + 2 <= 23).
  for (let h = openHour; h + duration <= closeHour + 1e-9; h += 0.5) {
    const slotStart = h;
    const slotEnd = h + duration;
    // A slot is available if it overlaps no occupied interval.
    const conflict = occupied.some(
      (iv) => slotStart < iv.end && slotEnd > iv.start
    );
    const hh = Math.floor(h);
    const mm = h - hh >= 0.5 ? "30" : "00";
    const time = `${String(hh).padStart(2, "0")}:${mm}`;
    slots.push({ time, available: !conflict });
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
  const occupied = getOccupiedIntervals(space, date);
  const slots = [];
  for (let h = openHour; h <= closeHour + 1e-9; h += 0.5) {
    const hh = Math.floor(h);
    const mm = h - hh >= 0.5 ? "30" : "00";
    const time = `${String(hh).padStart(2, "0")}:${mm}`;
    if (h >= closeHour - 1e-9) {
      slots.push({ time, free: false, isEnd: true });
      break;
    }
    // Free if this 30-min block overlaps no occupied interval.
    const free = !occupied.some((iv) => h < iv.end && h + 0.5 > iv.start);
    slots.push({ time, free });
  }
  return slots;
}

/**
 * Authoritative check used at submit time to prevent a race / double-book.
 * Returns true if the requested slot is free.
 */
export function isSlotAvailable(space, date, startTime, hours) {
  const occupied = getOccupiedIntervals(space, date);
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

export function listBookings({ status, space } = {}) {
  let sql = "SELECT * FROM bookings";
  const where = [];
  const params = [];
  if (status) {
    where.push("status = ?");
    params.push(status);
  }
  if (space) {
    where.push("space = ?");
    params.push(space);
  }
  if (where.length) sql += " WHERE " + where.join(" AND ");
  sql += " ORDER BY date ASC, start_time ASC";
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

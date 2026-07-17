import { db, getSetting, setSetting } from "./db.js";
import { BLOCKING_STATUSES, getEventStart, venueToday } from "./constants.js";
import { getClosureIntervals } from "./closures.js";
import { emailOwnerPendingRequests } from "./email.js";

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
      event_title, event_type, guests, alcohol, notes,
      is_recurring, recurring_schedule, is_public_event,
      rate, sessions, deposit, total
    ) VALUES (
      @space, @date, @start_time, @hours, 'pending',
      @client_name, @client_email, @client_phone,
      @event_title, @event_type, @guests, @alcohol, @notes,
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
    event_title: data.event_title ?? null,
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

/**
 * Create a recurring booking series: N linked `pending` rows sharing
 * `series_id` (= the first row's id). `dates` is an ordered array of
 * { date, start_time, hours } occurrences. ONE deposit lives on the first row
 * (the holder); the other rows carry deposit = 0 because the deposit is billed
 * once via its own invoice, keeping each date's rental cleanly refundable.
 * Returns { seriesId, ids }.
 */
export function createBookingSeries(data, dates) {
  if (!Array.isArray(dates) || dates.length === 0) {
    throw new Error("createBookingSeries requires at least one date");
  }
  const rate = Number(getSetting("standard_rate", "75"));
  const deposit = Number(getSetting("deposit", "150"));
  const seriesTotal = dates.length;
  const endDate = dates.reduce((max, d) => (d.date > max ? d.date : max), dates[0].date);

  const insert = db.prepare(`
    INSERT INTO bookings (
      space, date, start_time, hours, status,
      client_name, client_email, client_phone,
      event_title, event_type, guests, alcohol, notes,
      is_recurring, recurring_schedule, is_public_event,
      rate, sessions, deposit, total,
      series_id, series_index, series_total, is_deposit_holder, series_end_date
    ) VALUES (
      @space, @date, @start_time, @hours, 'pending',
      @client_name, @client_email, @client_phone,
      @event_title, @event_type, @guests, @alcohol, @notes,
      1, @recurring_schedule, @is_public_event,
      @rate, 1, @deposit, @total,
      @series_id, @series_index, @series_total, @is_deposit_holder, @series_end_date
    )
  `);

  const tx = db.transaction(() => {
    const ids = [];
    let seriesId = null;
    dates.forEach((occ, i) => {
      const isHolder = i === 0;
      const rowDeposit = isHolder ? deposit : 0;
      const rowTotal = computeTotal({ rate, hours: occ.hours, sessions: 1, deposit: rowDeposit });
      const info = insert.run({
        space: data.space,
        date: occ.date,
        start_time: occ.start_time,
        hours: Number(occ.hours),
        client_name: data.client_name,
        client_email: data.client_email,
        client_phone: data.client_phone,
        event_title: data.event_title ?? null,
        event_type: data.event_type ?? null,
        guests: data.guests ?? null,
        alcohol: data.alcohol ? 1 : 0,
        notes: data.notes ?? null,
        recurring_schedule: data.recurring_schedule ?? null,
        is_public_event: data.is_public_event ? 1 : 0,
        rate,
        deposit: rowDeposit,
        total: rowTotal,
        series_id: seriesId, // null on the first insert; patched once we know the id
        series_index: i + 1,
        series_total: seriesTotal,
        is_deposit_holder: isHolder ? 1 : 0,
        series_end_date: endDate,
      });
      const id = info.lastInsertRowid;
      ids.push(id);
      if (seriesId === null) {
        seriesId = id;
        db.prepare("UPDATE bookings SET series_id = ? WHERE id = ?").run(seriesId, id);
      }
    });
    return { seriesId, ids };
  });

  return tx();
}

/** All rows in a series, ordered by their position (earliest first). */
export function getSeries(seriesId) {
  if (!seriesId) return [];
  return db
    .prepare("SELECT * FROM bookings WHERE series_id = ? ORDER BY series_index ASC, date ASC")
    .all(seriesId);
}

/**
 * Place a single series date on the calendar as 'reserved' — it blocks the slot
 * but has NO hold_expires_at, so the hold-expiry sweep never releases it.
 * Payment is tracked per date via its own invoice. Optionally apply final
 * pricing first (deposit should be 0 for non-holder dates).
 */
export function reserveSeriesDate(id, pricing) {
  if (pricing) updateBookingPricing(id, pricing);
  db.prepare(
    "UPDATE bookings SET status = 'reserved', payment_status = 'unpaid', hold_expires_at = NULL WHERE id = ?"
  ).run(id);
  return getBooking(id);
}

/**
 * Approve a whole series: apply owner pricing across every date (deposit on the
 * holder only, 0 on the rest) and place each on the calendar as 'reserved'.
 * Returns the updated rows. Invoice creation is layered on by the caller.
 */
export function reserveSeries(seriesId, pricing) {
  for (const r of getSeries(seriesId)) {
    const p = pricing
      ? {
          rate: pricing.rate,
          hours: pricing.hours ?? r.hours,
          sessions: 1,
          deposit: r.is_deposit_holder ? pricing.deposit : 0,
        }
      : null;
    reserveSeriesDate(r.id, p);
  }
  return getSeries(seriesId);
}

/** Deny every date in a series and release any holds. */
export function denySeries(seriesId) {
  db.prepare(
    "UPDATE bookings SET status = 'denied', hold_expires_at = NULL WHERE series_id = ?"
  ).run(seriesId);
  return getSeries(seriesId);
}

/** Store the standalone deposit invoice id + link on the series holder row. */
export function setDepositInvoiceInfo(id, { invoiceId, paymentLink }) {
  db.prepare(
    "UPDATE bookings SET deposit_invoice_id = ?, deposit_payment_link = ?, deposit_payment_status = 'unpaid' WHERE id = ?"
  ).run(invoiceId ?? null, paymentLink ?? null, id);
  return getBooking(id);
}

/** Find the series holder by its deposit invoice id (for the Square webhook). */
export function getBookingByDepositInvoice(invoiceId) {
  return db
    .prepare("SELECT * FROM bookings WHERE deposit_invoice_id = ?")
    .get(invoiceId);
}

/** Mark a series' deposit invoice paid. */
export function markDepositPaid(id) {
  db.prepare(
    "UPDATE bookings SET deposit_payment_status = 'paid' WHERE id = ?"
  ).run(id);
  return getBooking(id);
}

/** Record that a series' deposit was refunded (used on whole-series cancel). */
export function setSeriesDepositRefunded(id, amount) {
  db.prepare(
    `UPDATE bookings
       SET deposit_status = 'refunded',
           deposit_refunded = ?,
           deposit_payment_status = CASE WHEN deposit_payment_status = 'paid' THEN 'refunded' ELSE deposit_payment_status END
     WHERE id = ?`
  ).run(Number(amount) || 0, id);
  return getBooking(id);
}

/**
 * Reserved series dates that still need a rental invoice and fall within the
 * lead window (date ≤ today + leadDays). Drives the series-invoices cron; the
 * first date is already invoiced at approval, so it has an id and is skipped.
 */
export function listSeriesDatesToInvoice(now = new Date(), leadDays = 5) {
  const today = now.toISOString().slice(0, 10);
  const cutoff = new Date(now.getTime() + leadDays * 86400000).toISOString().slice(0, 10);
  return db
    .prepare(
      `SELECT * FROM bookings
        WHERE series_id IS NOT NULL
          AND status = 'reserved'
          AND (square_invoice_id IS NULL OR square_invoice_id = '')
          AND date >= ?
          AND date <= ?
        ORDER BY date ASC`
    )
    .all(today, cutoff);
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
 *   sort  "date_asc" (default) | "date_desc" | "created_asc" | "created_desc"
 *   q     search over client name/email
 *   from  / to  inclusive YYYY-MM-DD event-date bounds
 */
export function listBookings({
  status,
  space,
  sort = "date_asc",
  q,
  from,
  to,
  archived = false,
} = {}) {
  let sql = "SELECT * FROM bookings";
  const where = [];
  const params = [];
  // archived: false → hide archived (the default everywhere); true → ONLY
  // archived (the "Archived" filter); null → both, for counts and exports.
  if (archived === true) {
    where.push("archived = 1");
  } else if (archived === false) {
    where.push("archived = 0");
  }
  if (status && status !== "all") {
    where.push("status = ?");
    params.push(status);
  }
  if (space) {
    where.push("space = ?");
    params.push(space);
  }
  if (q && q.trim()) {
    where.push("(client_name LIKE ? OR client_email LIKE ?)");
    const like = `%${q.trim()}%`;
    params.push(like, like);
  }
  if (from) {
    where.push("date >= ?");
    params.push(from);
  }
  if (to) {
    where.push("date <= ?");
    params.push(to);
  }
  if (where.length) sql += " WHERE " + where.join(" AND ");
  if (sort === "created_asc" || sort === "created_desc") {
    const cdir = sort === "created_asc" ? "ASC" : "DESC";
    sql += ` ORDER BY created_at ${cdir}, id ${cdir}`;
  } else {
    const dir = sort === "date_desc" ? "DESC" : "ASC";
    sql += ` ORDER BY date ${dir}, start_time ${dir}`;
  }
  return db.prepare(sql).all(...params);
}

/** How many free bookings each tenant gets per calendar year. */
export function tenantFreeAllowance() {
  return Number(getSetting("tenant_free_bookings", "2")) || 0;
}

// A tenant's free booking is one that's tagged to them, priced at $0, still
// standing, and not archived. Cancelled / denied / expired ones hand the credit
// back. A recurring series is ONE booking however many sessions it has, hence
// the grouping key.
const FREE_BOOKING_SQL = `
  SELECT tenant_id, COALESCE('s' || series_id, 'b' || id) AS series_key
    FROM bookings
   WHERE tenant_id IS NOT NULL
     AND total = 0
     AND archived = 0
     AND status IN ('held', 'reserved', 'confirmed', 'completed')
     AND date >= ? AND date <= ?
   GROUP BY tenant_id, series_key
`;

/**
 * Free bookings used per tenant in `year`, as { [tenantId]: count }. Counted by
 * EVENT date, not approval date — a tenant thinks of the perk in terms of when
 * they actually used the space.
 */
export function tenantFreeBookingUsage(year) {
  const rows = db
    .prepare(
      `SELECT tenant_id, COUNT(*) AS used FROM (${FREE_BOOKING_SQL}) GROUP BY tenant_id`
    )
    .all(`${year}-01-01`, `${year}-12-31`);
  return Object.fromEntries(rows.map((r) => [r.tenant_id, r.used]));
}

/** Free bookings a single tenant has used in `year`. */
export function tenantFreeBookingsUsed(tenantId, year) {
  if (!tenantId) return 0;
  return tenantFreeBookingUsage(year)[tenantId] || 0;
}

/** Tag (or untag) the tenant a booking belongs to. Applies across a series. */
export function setBookingTenant(id, tenantId) {
  const booking = getBooking(id);
  if (!booking) return null;
  const value = tenantId ? Number(tenantId) : null;
  if (booking.series_id) {
    db.prepare("UPDATE bookings SET tenant_id = ? WHERE series_id = ?").run(value, booking.series_id);
  } else {
    db.prepare("UPDATE bookings SET tenant_id = ? WHERE id = ?").run(value, id);
  }
  return getBooking(id);
}

/**
 * Hide a booking from the admin list without deleting it — the payment record,
 * activity trail and Square invoice id all survive. Reversible via unarchive.
 */
export function archiveBooking(id) {
  db.prepare("UPDATE bookings SET archived = 1 WHERE id = ?").run(id);
  return getBooking(id);
}

/** Put an archived booking back in the list. */
export function unarchiveBooking(id) {
  db.prepare("UPDATE bookings SET archived = 0 WHERE id = ?").run(id);
  return getBooking(id);
}

/** Archive every booking in a series at once (they're approved/cancelled as one). */
export function archiveSeries(seriesId, archived = true) {
  db.prepare("UPDATE bookings SET archived = ? WHERE series_id = ?").run(archived ? 1 : 0, seriesId);
  return getSeries(seriesId);
}

/**
 * Pending (unapproved) requests, collapsed the same way the admin Requests view
 * shows them: one entry per single booking, one per recurring series (anchored
 * at its holder). Returns { count, items } where each item is a compact summary.
 */
export function listPendingRequestSummary() {
  const pending = listBookings({ status: "pending", sort: "created_asc" });
  const seenSeries = new Set();
  const items = [];
  for (const b of pending) {
    if (b.series_id) {
      if (seenSeries.has(b.series_id)) continue;
      seenSeries.add(b.series_id);
      const rows = getSeries(b.series_id).filter((r) => r.status === "pending");
      if (!rows.length) continue;
      const holder = rows.find((r) => r.is_deposit_holder) || rows[0];
      items.push({ kind: "series", name: holder.client_name, space: holder.space, date: holder.date, sessions: rows.length });
    } else {
      items.push({ kind: "single", name: b.client_name, space: b.space, date: b.date, sessions: 1 });
    }
  }
  return { count: items.length, items };
}

const REMINDER_TZ = "America/Denver"; // the venue's timezone (Mountain)

/** Today's date (YYYY-MM-DD) in the venue's timezone, drift-free. */
function reminderToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: REMINDER_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Weekday in the venue's timezone: 0 = Sunday … 6 = Saturday. */
function reminderWeekday() {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: REMINDER_TZ, weekday: "short" }).format(new Date());
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
}

/**
 * Cron entry point: on business days (Mon–Fri), if any booking requests are
 * still unapproved, email the owner a nudge. Idempotent — guarded to send at
 * most once per calendar day (a settings key), so it's safe to call repeatedly.
 * Skips weekends. Pass { force: true } to bypass the weekend + once-a-day guards
 * (used for a manual test send).
 */
export async function runPendingRequestReminder({ force = false } = {}) {
  const weekday = reminderWeekday();
  if (!force && (weekday === 0 || weekday === 6)) return { skipped: "weekend", count: 0 };

  const { count, items } = listPendingRequestSummary();
  if (count === 0) return { skipped: "none", count: 0 };

  const today = reminderToday();
  if (!force && getSetting("pending_reminder_last_sent") === today) {
    return { skipped: "already_sent_today", count };
  }

  await emailOwnerPendingRequests(items, count);
  setSetting("pending_reminder_last_sent", today);
  return { ok: true, count };
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

  // Stamp today as the last reminder date so the approval email covers the
  // approval day; the payment-reminder cron then starts nudging from the next
  // day (see runPaymentReminders).
  db.prepare(
    `UPDATE bookings
       SET status = 'held', payment_status = 'unpaid', hold_expires_at = ?,
           payment_reminder_last_sent = ?
     WHERE id = ?`
  ).run(holdExpiresIso, venueToday(), id);

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

/**
 * Held, unpaid bookings that are due a payment reminder today: the hold is still
 * live (hold_expires_at in the future — expired ones get the hold-expired email
 * instead), an invoice exists to link, and we haven't already reminded them
 * today. Series rows are 'reserved' (not 'held') so they're naturally excluded —
 * their invoicing is handled by the series-invoices cron.
 */
export function listPaymentRemindersDue(now = new Date()) {
  const today = venueToday(now);
  return db
    .prepare(
      `SELECT * FROM bookings
        WHERE status = 'held'
          AND payment_status != 'paid'
          AND archived = 0
          AND payment_link IS NOT NULL AND payment_link != ''
          AND hold_expires_at IS NOT NULL AND hold_expires_at > ?
          AND (payment_reminder_last_sent IS NULL OR payment_reminder_last_sent != ?)
        ORDER BY hold_expires_at ASC`
    )
    .all(now.toISOString(), today);
}

/** Record that a payment reminder was sent for a booking today (venue date). */
export function markPaymentReminderSent(id, now = new Date()) {
  db.prepare("UPDATE bookings SET payment_reminder_last_sent = ? WHERE id = ?").run(venueToday(now), id);
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
  // Restoring to held re-opens the payment window; reset the reminder clock so
  // nudges start fresh from the next day rather than firing immediately.
  db.prepare(
    "UPDATE bookings SET status = ?, restored_at = datetime('now'), payment_reminder_last_sent = ? WHERE id = ?"
  ).run(status, status === "held" ? venueToday() : null, id);
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

  // For a recurring-series date, the deposit is billed on a separate invoice and
  // resolved once at series end — never part of a single session's cancellation.
  // So a per-date cancel refunds rental only (full before cutoff, nothing within).
  const deposit = booking.series_id ? 0 : Number(booking.deposit) || 0;
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

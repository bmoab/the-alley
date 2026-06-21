import { db, getSetting } from "./db.js";

/**
 * Owner closures — block new bookings for a space (or the whole building) on a
 * date range, all day or within a time window. These are HARD blocks (no cleanup
 * buffer); existing bookings are not affected.
 */

function toHour(hhmm) {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h + (m || 0) / 60;
}

export function listClosures() {
  return db
    .prepare("SELECT * FROM closures ORDER BY start_date ASC, start_time ASC, id ASC")
    .all();
}

export function createClosure(d) {
  const space = ["loft", "main", "all"].includes(d.space) ? d.space : "all";
  const start = (d.start_date || "").trim();
  const end = (d.end_date || "").trim() || start;
  if (!start) return null;
  // Normalize order if reversed.
  const [s, e] = start <= end ? [start, end] : [end, start];
  return db
    .prepare(
      `INSERT INTO closures (space, start_date, end_date, start_time, end_time, reason)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      space,
      s,
      e,
      d.start_time || null,
      d.end_time || null,
      (d.reason || "").trim() || null
    ).lastInsertRowid;
}

export function deleteClosure(id) {
  db.prepare("DELETE FROM closures WHERE id = ?").run(id);
}

/** Closures (rows) that apply to a given space + date. */
export function closuresForDate(space, date) {
  return db
    .prepare(
      `SELECT * FROM closures
       WHERE (space = ? OR space = 'all') AND start_date <= ? AND end_date >= ?
       ORDER BY start_time ASC`
    )
    .all(space, date, date);
}

/**
 * Closure intervals [{start,end}] (fractional hours) for a space+date. Full-day
 * closures span open_hour..close_hour from settings.
 */
export function getClosureIntervals(space, date) {
  const openHour = Number(getSetting("open_hour", "8"));
  const closeHour = Number(getSetting("close_hour", "23"));
  return closuresForDate(space, date).map((c) =>
    c.start_time && c.end_time
      ? { start: toHour(c.start_time), end: toHour(c.end_time) }
      : { start: openHour, end: closeHour }
  );
}

/** True if [startHour, endHour) overlaps any closure for this space+date. */
export function isClosedForBooking(space, date, startHour, endHour) {
  return getClosureIntervals(space, date).some(
    (iv) => startHour < iv.end && endHour > iv.start
  );
}

/** True if the whole operating day is closed for this space+date. */
export function isFullyClosed(space, date) {
  const openHour = Number(getSetting("open_hour", "8"));
  const closeHour = Number(getSetting("close_hour", "23"));
  return getClosureIntervals(space, date).some(
    (iv) => iv.start <= openHour && iv.end >= closeHour
  );
}

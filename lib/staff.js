import { customAlphabet } from "nanoid";
import { db } from "./db.js";
import { listBookings } from "./bookings.js";
import { listAdminCalendarEvents, listingIndex } from "./catalog.js";
import { listClosures } from "./closures.js";
import { BLOCKING_STATUSES, spaceName, shiftDate, venueToday } from "./constants.js";

/**
 * Employees and the shift schedule (server-only).
 *
 * An employee is a person on the schedule. Their login, when they have one, is
 * an admin_users row with role 'staff' (see lib/auth.js) linked through
 * employees.admin_user_id. Dates and times are venue-local wall clock, exactly
 * like bookings: "YYYY-MM-DD" and "HH:MM".
 */

const icsToken = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789", 24);

// Hex (inline-styled, so Tailwind can't purge them) — distinct at a glance on
// white and readable under white text.
export const EMPLOYEE_COLORS = [
  "#4a7c4e", // green
  "#2471a3", // blue
  "#9c4a2e", // rust
  "#7d5ba6", // violet
  "#c08a1e", // ochre
  "#2a8c8c", // teal
  "#b4486b", // rose
  "#5b6770", // slate
];

// ---------------------------------------------------------------------------
// Employees
// ---------------------------------------------------------------------------

export function listEmployees({ includeInactive = false } = {}) {
  return db
    .prepare(
      `SELECT e.*, u.email AS login_email, u.role AS login_role, u.is_active AS login_active,
              u.last_login_at AS login_last_at
         FROM employees e
         LEFT JOIN admin_users u ON u.id = e.admin_user_id
        ${includeInactive ? "" : "WHERE e.is_active = 1"}
        ORDER BY e.is_active DESC, e.name COLLATE NOCASE`
    )
    .all();
}

export function getEmployee(id) {
  return db.prepare("SELECT * FROM employees WHERE id = ?").get(id);
}

/**
 * The employee record behind a login. Linked by admin_user_id; failing that, an
 * unlinked employee with the same email is claimed — so an owner can add
 * someone to the schedule first and hand them a login later without a second
 * step to connect the two.
 */
export function getEmployeeForUser(user) {
  if (!user) return null;
  const linked = db.prepare("SELECT * FROM employees WHERE admin_user_id = ?").get(user.id);
  if (linked) return linked;
  const byEmail = db
    .prepare(
      `SELECT * FROM employees
        WHERE admin_user_id IS NULL AND lower(trim(email)) = ? AND is_active = 1
        ORDER BY id LIMIT 1`
    )
    .get(String(user.email || "").toLowerCase().trim());
  if (!byEmail) return null;
  db.prepare("UPDATE employees SET admin_user_id = ? WHERE id = ?").run(user.id, byEmail.id);
  return { ...byEmail, admin_user_id: user.id };
}

function cleanText(v) {
  const s = String(v ?? "").trim();
  return s || null;
}

function nextColor() {
  const used = db.prepare("SELECT color FROM employees WHERE is_active = 1").all().map((r) => r.color);
  return EMPLOYEE_COLORS.find((c) => !used.includes(c)) || EMPLOYEE_COLORS[used.length % EMPLOYEE_COLORS.length];
}

export function createEmployee({ name, email, phone, color, hire_date, notes, adminUserId = null }) {
  const cleanName = cleanText(name);
  if (!cleanName) throw new Error("A name is required.");
  const info = db
    .prepare(
      `INSERT INTO employees (admin_user_id, name, email, phone, color, hire_date, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      adminUserId,
      cleanName,
      cleanText(email)?.toLowerCase() ?? null,
      cleanText(phone),
      EMPLOYEE_COLORS.includes(color) ? color : nextColor(),
      cleanText(hire_date),
      cleanText(notes)
    );
  return getEmployee(info.lastInsertRowid);
}

/** Update an employee. A field left out of `fields` keeps its current value. */
export function updateEmployee(id, fields) {
  const current = getEmployee(id);
  if (!current) throw new Error("That employee no longer exists.");
  const keep = (k, clean = cleanText) => (fields[k] === undefined ? current[k] : clean(fields[k]));
  db.prepare(
    `UPDATE employees
        SET name = ?, email = ?, phone = ?, color = ?, hire_date = ?, end_date = ?, notes = ?
      WHERE id = ?`
  ).run(
    cleanText(fields.name) || current.name,
    keep("email", (v) => cleanText(v)?.toLowerCase() ?? null),
    keep("phone"),
    EMPLOYEE_COLORS.includes(fields.color) ? fields.color : current.color,
    keep("hire_date"),
    keep("end_date"),
    keep("notes"),
    id
  );
  return getEmployee(id);
}

export function linkEmployeeLogin(id, adminUserId) {
  db.prepare("UPDATE employees SET admin_user_id = ? WHERE id = ?").run(adminUserId, id);
}

/**
 * Deactivate (or bring back) an employee. Their future shifts go back to open
 * rather than vanishing — someone still has to cover them.
 */
export function setEmployeeActive(id, active) {
  db.prepare("UPDATE employees SET is_active = ?, end_date = CASE WHEN ? = 0 THEN COALESCE(end_date, ?) ELSE NULL END WHERE id = ?").run(
    active ? 1 : 0,
    active ? 1 : 0,
    venueToday(),
    id
  );
  if (!active) {
    return db
      .prepare("UPDATE shifts SET employee_id = NULL, updated_at = datetime('now') WHERE employee_id = ? AND date > ?")
      .run(id, venueToday()).changes;
  }
  return 0;
}

export function ensureIcsToken(employeeId) {
  const row = getEmployee(employeeId);
  if (!row) return null;
  if (row.ics_token) return row.ics_token;
  const token = icsToken();
  db.prepare("UPDATE employees SET ics_token = ? WHERE id = ? AND ics_token IS NULL").run(token, employeeId);
  return getEmployee(employeeId).ics_token;
}

export function getEmployeeByIcsToken(token) {
  if (!token) return null;
  return db.prepare("SELECT * FROM employees WHERE ics_token = ? AND is_active = 1").get(token) || null;
}

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

/** "9:30" / "09:30" → "09:30"; anything else → null. */
export function normalizeTime(v) {
  const m = String(v ?? "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

function minutesOf(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Length of a start→end span in hours. An end at or before the start runs past midnight. */
export function spanHours(start, end) {
  let mins = minutesOf(end) - minutesOf(start);
  if (mins <= 0) mins += 24 * 60;
  return mins / 60;
}

export function shiftHours(shift) {
  return spanHours(shift.start_time, shift.end_time);
}

/** The Sunday that starts the week holding `ymd` (weeks run Sun–Sat, like the calendar). */
export function weekStart(ymd = venueToday()) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return shiftDate(ymd, { days: -dow });
}

export function weekDates(start) {
  return Array.from({ length: 7 }, (_, i) => shiftDate(start, { days: i }));
}

/** "HH:MM" plus fractional hours → "HH:MM" (wraps past midnight). */
export function addHours(hhmm, hours) {
  const total = (minutesOf(hhmm) + Math.round(hours * 60)) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Shifts
// ---------------------------------------------------------------------------

const SHIFT_SELECT = `
  SELECT s.*, e.name AS employee_name, e.color AS employee_color
    FROM shifts s
    LEFT JOIN employees e ON e.id = s.employee_id`;

export function listShifts({ from, to, employeeId, publishedOnly = false } = {}) {
  const where = [];
  const params = [];
  if (from) {
    where.push("s.date >= ?");
    params.push(from);
  }
  if (to) {
    where.push("s.date <= ?");
    params.push(to);
  }
  if (employeeId) {
    where.push("s.employee_id = ?");
    params.push(employeeId);
  }
  if (publishedOnly) where.push("s.status = 'published'");
  const sql = `${SHIFT_SELECT}${where.length ? ` WHERE ${where.join(" AND ")}` : ""}
    ORDER BY s.date, s.start_time, e.name COLLATE NOCASE`;
  return db.prepare(sql).all(...params);
}

export function getShift(id) {
  return db.prepare(`${SHIFT_SELECT} WHERE s.id = ?`).get(id);
}

function validShift({ date, start_time, end_time }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) throw new Error("Pick a date for the shift.");
  const start = normalizeTime(start_time);
  const end = normalizeTime(end_time);
  if (!start || !end) throw new Error("Enter a start and end time.");
  if (start === end) throw new Error("A shift can't start and end at the same time.");
  if (spanHours(start, end) > 16) throw new Error("That shift is over 16 hours — check the times.");
  return { start, end };
}

/** Minutes since midnight of the shift's day, with past-midnight ends pushed past 24:00. */
function spanMinutes(start, end) {
  const a = minutesOf(start);
  let b = minutesOf(end);
  if (b <= a) b += 24 * 60;
  return [a, b];
}

/**
 * Another shift the same person already has that this one would overlap, if
 * any. Checks the day before too, for a shift running past midnight into this one.
 */
export function findOverlap({ employeeId, date, start, end, excludeId = null }) {
  if (!employeeId) return null;
  const [a, b] = spanMinutes(start, end);
  const prev = shiftDate(date, { days: -1 });
  const rows = db
    .prepare(
      `SELECT * FROM shifts WHERE employee_id = ? AND date IN (?, ?) AND id IS NOT ?`
    )
    .all(employeeId, prev, date, excludeId);
  for (const r of rows) {
    let [c, d] = spanMinutes(r.start_time, r.end_time);
    if (r.date === prev) {
      c -= 24 * 60;
      d -= 24 * 60;
    }
    if (a < d && c < b) return r;
  }
  return null;
}

function assertNoOverlap(fields, start, end, excludeId = null) {
  const clash = findOverlap({
    employeeId: cleanId(fields.employee_id),
    date: fields.date,
    start,
    end,
    excludeId,
  });
  if (clash) {
    throw new Error(
      `They're already on ${clash.start_time}–${clash.end_time}${clash.date !== fields.date ? " the day before" : ""} — that overlaps.`
    );
  }
}

function cleanId(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function createShift(fields, { createdBy = null } = {}) {
  const { start, end } = validShift(fields);
  assertNoOverlap(fields, start, end);
  const info = db
    .prepare(
      `INSERT INTO shifts (employee_id, date, start_time, end_time, role, note, booking_id, event_id, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      cleanId(fields.employee_id),
      fields.date,
      start,
      end,
      cleanText(fields.role),
      cleanText(fields.note),
      cleanId(fields.booking_id),
      cleanId(fields.event_id),
      fields.status === "published" ? "published" : "draft",
      createdBy
    );
  return getShift(info.lastInsertRowid);
}

/** Edit a shift. Its draft/published state is kept — a published shift stays visible to staff. */
export function updateShift(id, fields) {
  const current = getShift(id);
  if (!current) throw new Error("That shift no longer exists.");
  const merged = { ...current, ...fields };
  const { start, end } = validShift(merged);
  assertNoOverlap(merged, start, end, id);
  db.prepare(
    `UPDATE shifts
        SET employee_id = ?, date = ?, start_time = ?, end_time = ?, role = ?, note = ?,
            booking_id = ?, event_id = ?, updated_at = datetime('now')
      WHERE id = ?`
  ).run(
    cleanId(merged.employee_id),
    merged.date,
    start,
    end,
    cleanText(merged.role),
    cleanText(merged.note),
    cleanId(merged.booking_id),
    cleanId(merged.event_id),
    id
  );
  return { before: current, after: getShift(id) };
}

export function deleteShift(id) {
  const current = getShift(id);
  if (!current) return null;
  db.prepare("DELETE FROM shifts WHERE id = ?").run(id);
  return current;
}

/** Publish every draft shift between two dates (inclusive). Returns how many. */
export function publishShifts(from, to) {
  return db
    .prepare(
      "UPDATE shifts SET status = 'published', updated_at = datetime('now') WHERE status = 'draft' AND date BETWEEN ? AND ?"
    )
    .run(from, to).changes;
}

export function countDrafts(from, to) {
  return db
    .prepare("SELECT COUNT(*) AS n FROM shifts WHERE status = 'draft' AND date BETWEEN ? AND ?")
    .get(from, to).n;
}

/**
 * Copy one week's shifts onto another as drafts, skipping any that already
 * exist there (same person, day and start) so pressing it twice is harmless.
 * Shifts of people who've since left come across as open shifts.
 */
export function copyWeek(fromStart, toStart, { createdBy = null } = {}) {
  const source = listShifts({ from: fromStart, to: shiftDate(fromStart, { days: 6 }) });
  const activeIds = new Set(listEmployees().map((e) => e.id));
  const exists = db.prepare(
    "SELECT 1 FROM shifts WHERE date = ? AND start_time = ? AND end_time = ? AND COALESCE(employee_id, 0) = COALESCE(?, 0)"
  );
  const insert = db.prepare(
    `INSERT INTO shifts (employee_id, date, start_time, end_time, role, note, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, 'draft', ?)`
  );
  const offset = Math.round(
    (new Date(toStart + "T12:00:00") - new Date(fromStart + "T12:00:00")) / 86400000
  );
  let copied = 0;
  db.transaction(() => {
    for (const s of source) {
      const date = shiftDate(s.date, { days: offset });
      const employeeId = s.employee_id && activeIds.has(s.employee_id) ? s.employee_id : null;
      if (exists.get(date, s.start_time, s.end_time, employeeId)) continue;
      // Event links don't carry over — next week's events are different ones.
      insert.run(employeeId, date, s.start_time, s.end_time, s.role, s.note, createdBy);
      copied++;
    }
  })();
  return copied;
}

/** Scheduled hours per employee for a list of shifts: { [employeeId]: hours }. */
export function hoursByEmployee(shifts) {
  const out = {};
  for (const s of shifts) {
    if (!s.employee_id) continue;
    out[s.employee_id] = (out[s.employee_id] || 0) + shiftHours(s);
  }
  return out;
}

// ---------------------------------------------------------------------------
// What's happening — the bookings and events a shift is scheduled around
// ---------------------------------------------------------------------------

/**
 * Everything happening in the building between two dates, for drawing behind
 * the schedule: standing bookings (titled by their listing when they have
 * one), The Alley's own events, and closures by date. Nothing about money or
 * client contact details — staff see this too.
 *
 * Returns { happenings: [{ key, date, start, end, title, room, isPublic, bookingId, eventId }],
 *           closed: { [date]: [label] } }.
 */
export function scheduleContext(from, to) {
  const bookings = listBookings({ status: BLOCKING_STATUSES, from, to });
  const { byBooking, bySeries } = listingIndex();
  const listingFor = (b) => byBooking[b.id] || (b.series_id != null ? bySeries[b.series_id] : null);

  const covered = new Set();
  const happenings = [];
  for (const b of bookings) {
    const listing = listingFor(b);
    if (listing) covered.add(`${listing.id}|${b.date}`);
    happenings.push({
      key: `b${b.id}`,
      date: b.date,
      start: b.start_time,
      end: b.start_time ? addHours(b.start_time, Number(b.hours) || 0) : null,
      title: listing?.title || b.event_title || b.client_name || "Private booking",
      room: spaceName(b.space),
      isPublic: listing?.status === "live",
      bookingId: b.id,
      eventId: listing?.id ?? null,
    });
  }
  for (const e of listAdminCalendarEvents()) {
    if (e.date < from || e.date > to) continue;
    if (covered.has(`${e.id}|${e.date}`) || e.hiddenReason) continue;
    happenings.push({
      key: `e${e.id}-${e.date}`,
      date: e.date,
      start: e.public_time || e.time || null,
      end: e.public_end_time || null,
      title: e.title || "Event",
      room: e.space ? spaceName(e.space) : "The Alley",
      isPublic: true,
      bookingId: e.booking_id ?? null,
      eventId: e.id,
    });
  }
  happenings.sort((a, b) => (a.date + (a.start || "")).localeCompare(b.date + (b.start || "")));

  const closed = {};
  for (const c of listClosures()) {
    if (c.end_date < from || c.start_date > to) continue;
    let d = c.start_date < from ? from : c.start_date;
    const last = c.end_date > to ? to : c.end_date;
    while (d <= last) {
      const label =
        (c.space === "all" ? "Building closed" : `${spaceName(c.space)} closed`) +
        (c.start_time && c.end_time ? ` ${c.start_time}–${c.end_time}` : "") +
        (c.reason ? ` · ${c.reason}` : "");
      (closed[d] ||= []).push(label);
      d = shiftDate(d, { days: 1 });
    }
  }
  return { happenings, closed };
}

import { db } from "./db.js";
import { isSquareConfigured } from "./square.js";
import { fetchScheduledShifts, fetchTeamFirstNames } from "./square-retail.js";
import { venueToday, venueNow, shiftDate } from "./constants.js";

/**
 * Who's working, for the tenants who share the staff cost (server-only).
 *
 * The schedule lives in Square (Team → Scheduling). This reads what's been
 * PUBLISHED there — drafts never show — for the rest of this week and all of
 * next (Sunday–Saturday weeks), and keeps it a few minutes so every tenant's
 * page doesn't ask Square again. Read-only: nothing here changes Square.
 * Tenants see first names and times, nothing else.
 */

const KEEP_MS = 5 * 60 * 1000;

let cached = null; // { at, from, value }
let running = null;

/** Does this directory business pay a share of the staff (so sees the schedule)? */
export function sharesStaffCost(directoryId) {
  return !!db.prepare("SELECT 1 FROM directory WHERE id = ? AND shares_staff_cost = 1").get(directoryId);
}

/** Square's "2026-10-20T10:00:00-06:00" → venue-local { day: "2026-10-20", time: "10:00" }. */
function local(iso) {
  const s = venueNow(new Date(iso));
  return { day: s.slice(0, 10), time: s.slice(11, 16) };
}

/**
 * Today through next Saturday, one entry per day:
 * { ok, weeks: [[{ date, shifts: [{ name, start, end }] }], [...]] } — this
 * week's days left, then next week.
 * ok is false when Square couldn't be reached (the page says so, not "nobody").
 */
export async function upcomingStaffSchedule({ today = venueToday() } = {}) {
  if (cached && cached.from === today && Date.now() - cached.at < KEEP_MS) return cached.value;
  if (running) return running;
  running = (async () => {
    const left = 7 - new Date(`${today}T12:00:00`).getDay(); // days left this week, today included
    const days = Array.from({ length: left + 7 }, (_, i) => ({ date: shiftDate(today, { days: i }), shifts: [] }));
    const end = days[days.length - 1].date;
    const weeks = [days.slice(0, left), days.slice(left)];
    if (!isSquareConfigured()) return { ok: true, weeks };
    try {
      const [{ shifts }, names] = await Promise.all([fetchScheduledShifts(today, end), fetchTeamFirstNames()]);
      const byDay = Object.fromEntries(days.map((d) => [d.date, d]));
      for (const s of shifts) {
        const a = local(s.start_at);
        const b = s.end_at ? local(s.end_at) : null;
        byDay[a.day]?.shifts.push({
          name: (s.team_member_id && names[s.team_member_id]) || "Open shift",
          start: a.time,
          end: b?.time || "",
        });
      }
      const value = { ok: true, weeks };
      cached = { at: Date.now(), from: today, value };
      return value;
    } catch (err) {
      console.error("[staff-schedule]", err.message);
      return { ok: false, weeks };
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

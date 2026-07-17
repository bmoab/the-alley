// Pure recurrence date generation for booking series — no DB/DOM, safe in both
// client (booking modal) and server (tests). Produces an ordered YYYY-MM-DD[].
//
// Rule shapes:
//   { mode: "weekly",          interval }                — every `interval` weeks
//   { mode: "monthly-weekday", weekday, nth }            — nth weekday each month
//   { mode: "monthly-date" }                             — same day-of-month each month
//   { mode: "manual",          dates: [...] }            — explicit dates
// weekday: 0=Sun … 6=Sat.  nth: 1..5 or -1 (last).

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const NTH_LABELS = { 1: "First", 2: "Second", 3: "Third", 4: "Fourth", 5: "Fifth", "-1": "Last" };

const pad2 = (n) => String(n).padStart(2, "0");
const ymd = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`; // m is 0-indexed
const parse = (s) => {
  const [y, m, d] = String(s).split("-").map(Number);
  return { y, m: m - 1, d };
};
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();

export function weekdayOf(s) {
  const { y, m, d } = parse(s);
  return new Date(y, m, d).getDay();
}
export function addDaysYmd(s, days) {
  const { y, m, d } = parse(s);
  const dt = new Date(y, m, d + days);
  return ymd(dt.getFullYear(), dt.getMonth(), dt.getDate());
}
/** Which occurrence of its weekday the date is within its month (1-based). */
export function weekOfMonthFor(s) {
  return Math.floor((parse(s).d - 1) / 7) + 1;
}

/**
 * The date of the nth `weekday` in a month, or null if it doesn't exist
 * (e.g. a 5th Friday). nth = -1 (or "last") gives the last one.
 */
export function nthWeekdayOfMonth(year, monthIndex, weekday, nth) {
  const dim = daysInMonth(year, monthIndex);
  if (nth === -1 || nth === "last") {
    const lastWd = new Date(year, monthIndex, dim).getDay();
    return ymd(year, monthIndex, dim - ((lastWd - weekday + 7) % 7));
  }
  const firstWd = new Date(year, monthIndex, 1).getDay();
  const day = 1 + ((weekday - firstWd + 7) % 7) + (Number(nth) - 1) * 7;
  return day > dim ? null : ymd(year, monthIndex, day);
}

/**
 * Generate the series occurrence dates. The chosen start date anchors the
 * series; only occurrences on or after it are included, up to `count`.
 */
export function generateSeriesDates(rule = {}, startDate, count) {
  if (!startDate) return [];
  const mode = rule.mode || "weekly";

  if (mode === "manual") {
    return Array.from(
      new Set((rule.dates || []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))
    ).sort();
  }

  const n = Math.max(1, Math.min(52, Number(count) || 1));
  const { y, m } = parse(startDate);
  const out = [];

  if (mode === "weekly") {
    const interval = Math.max(1, Number(rule.interval) || 1);
    for (let i = 0; i < n; i++) out.push(addDaysYmd(startDate, i * 7 * interval));
    return out;
  }

  if (mode === "monthly-weekday") {
    const weekday = Number.isInteger(rule.weekday) ? rule.weekday : weekdayOf(startDate);
    const nth = rule.nth ?? weekOfMonthFor(startDate);
    let mi = m, yr = y, guard = 0;
    while (out.length < n && guard < n + 24) {
      const d = nthWeekdayOfMonth(yr, mi, weekday, nth);
      if (d && d >= startDate) out.push(d);
      if (++mi > 11) { mi = 0; yr++; }
      guard++;
    }
    return out;
  }

  if (mode === "monthly-date") {
    const dom = parse(startDate).d;
    let mi = m, yr = y, guard = 0;
    while (out.length < n && guard < n + 24) {
      if (dom <= daysInMonth(yr, mi)) {
        const d = ymd(yr, mi, dom);
        if (d >= startDate) out.push(d);
      }
      if (++mi > 11) { mi = 0; yr++; }
      guard++;
    }
    return out;
  }

  return [];
}

/** Human-readable schedule string (display only) for a rule + resulting dates. */
export function describeRule(rule = {}, startDate, dateCount) {
  const mode = rule.mode || "weekly";
  const count = dateCount ?? 0;
  if (mode === "manual") return `${count} selected date${count === 1 ? "" : "s"}`;
  if (mode === "weekly") {
    const wd = startDate ? WEEKDAYS[weekdayOf(startDate)] : "week";
    const iv = Math.max(1, Number(rule.interval) || 1);
    const lead = iv === 1 ? `Every ${wd}` : iv === 2 ? `Every other ${wd}` : `Every ${iv} weeks on ${wd}`;
    return `${lead} × ${count}`;
  }
  if (mode === "monthly-weekday") {
    const weekday = Number.isInteger(rule.weekday) ? rule.weekday : weekdayOf(startDate);
    const nth = rule.nth ?? weekOfMonthFor(startDate);
    return `${NTH_LABELS[String(nth)] || ""} ${WEEKDAYS[weekday]} monthly × ${count}`.trim();
  }
  if (mode === "monthly-date") {
    const dom = startDate ? parse(startDate).d : 1;
    return `Monthly on day ${dom} × ${count}`;
  }
  return `${count} sessions`;
}

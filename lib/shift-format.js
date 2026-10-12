/**
 * Compact time formatting for shifts — "10am", "5:30pm", "10am–6pm". Pure and
 * client-safe (no database), so the schedule's client component and the
 * server-rendered staff pages share one spelling.
 */
export function fmtTime(hhmm) {
  if (!hhmm) return "";
  let [h, m] = hhmm.split(":").map(Number);
  const p = h >= 12 ? "pm" : "am";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return m ? `${h}:${String(m).padStart(2, "0")}${p}` : `${h}${p}`;
}

export function fmtRange(start, end) {
  if (!start) return "";
  return end ? `${fmtTime(start)}–${fmtTime(end)}` : fmtTime(start);
}

/** 7.5 → "7.5h", 8 → "8h". */
export function fmtHours(h) {
  return `${Math.round(h * 100) / 100}h`;
}

/** "2026-09-14" → "Mon Sep 14" — short enough for a timesheet row. */
export function fmtDay(ymd) {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).replace(",", "");
}

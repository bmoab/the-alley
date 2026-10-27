import { venueToday, shiftDate } from "./constants.js";

/**
 * An account's Activity: the pure half (no database — the admin's account tour
 * filters its sample rows with it too). lib/account-activity.js builds the rows.
 *
 * A row: { key, at, type, also?, title, sub?, amount?, flow?, details?, lines?,
 *          links?, href? }
 *   at       venue-local "YYYY-MM-DD HH:MM", or a bare "YYYY-MM-DD"
 *   type     one of ACTIVITY_TYPES (its icon); `also` lists other types it
 *            belongs under (a refund is a booking AND a payment)
 *   amount   dollars; flow "in" = money to them, "out" = money from them
 *   details  [[label, value]] · lines [{ name, qty, amount }] · links [{ label, href }]
 *   href     the whole row opens this (an email)
 */

export const ACTIVITY_TYPES = [
  { key: "booking", label: "Bookings" },
  { key: "payment", label: "Payments" },
  { key: "sale", label: "Sales" },
  { key: "payout", label: "Payouts" },
  { key: "stock", label: "Stock" },
  { key: "listing", label: "Events" },
  { key: "terms", label: "Agreements" },
  { key: "email", label: "Emails" },
  { key: "account", label: "Account" },
];

const TYPE_KEYS = new Set(ACTIVITY_TYPES.map((t) => t.key));

const monthStartOf = (ymd) => `${ymd.slice(0, 7)}-01`;

export const PERIODS = [
  { key: "all", label: "All time", range: () => ({ from: null, to: null }) },
  { key: "30d", label: "Last 30 days", range: (t) => ({ from: shiftDate(t, { days: -30 }), to: t }) },
  { key: "month", label: "This month", range: (t) => ({ from: monthStartOf(t), to: t }) },
  {
    key: "lastmonth",
    label: "Last month",
    range: (t) => ({ from: shiftDate(monthStartOf(t), { months: -1 }), to: shiftDate(monthStartOf(t), { days: -1 }) }),
  },
  { key: "year", label: "This year", range: (t) => ({ from: `${t.slice(0, 4)}-01-01`, to: t }) },
  { key: "lastyear", label: "Last year", range: (t) => ({ from: `${Number(t.slice(0, 4)) - 1}-01-01`, to: `${Number(t.slice(0, 4)) - 1}-12-31` }) },
];

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The filters in a page's search params: { type, period, from, to, q, more }. */
export function readFilters(sp = {}, today = venueToday()) {
  const type = TYPE_KEYS.has(sp.type) ? sp.type : "all";
  const q = String(sp.q || "").trim().slice(0, 80);
  const more = Math.min(2000, Math.max(0, Number(sp.more) || 0));
  let from = DAY.test(sp.from || "") ? sp.from : null;
  let to = DAY.test(sp.to || "") ? sp.to : null;
  let period = "custom";
  if (!from && !to) {
    const p = PERIODS.find((x) => x.key === sp.period) || PERIODS[0];
    period = p.key;
    ({ from, to } = p.range(today));
  } else if (from && to && from > to) {
    [from, to] = [to, from];
  }
  return { type, period, from, to, q, more };
}

/** A query string for these filters with `change` applied (paging resets). */
export function filterQuery(f, change = {}) {
  const next = { ...f, more: 0, ...change };
  const p = new URLSearchParams();
  if (next.type && next.type !== "all") p.set("type", next.type);
  if (next.period === "custom") {
    if (next.from) p.set("from", next.from);
    if (next.to) p.set("to", next.to);
  } else if (next.period && next.period !== "all") p.set("period", next.period);
  if (next.q) p.set("q", next.q);
  if (next.more) p.set("more", String(next.more));
  const s = p.toString();
  return s ? `?${s}` : "";
}

const typesOf = (r) => [r.type, ...(r.also || [])];

function text(r) {
  return [
    r.title,
    r.sub,
    ...(r.details || []).flat(),
    ...(r.lines || []).map((l) => l.name),
    r.amount != null ? Number(r.amount).toFixed(2) : "",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * Apply the filters: { rows, counts, total } — `counts` per type are within
 * the date range and search (so each chip says what tapping it would show).
 */
export function filterActivity(rows, f) {
  const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
  const inRange = rows.filter((r) => {
    const day = String(r.at).slice(0, 10);
    if (f.from && day < f.from) return false;
    if (f.to && day > f.to) return false;
    if (words.length) {
      const t = text(r);
      if (!words.every((w) => t.includes(w))) return false;
    }
    return true;
  });
  const counts = { all: inRange.length };
  for (const r of inRange) for (const t of new Set(typesOf(r))) counts[t] = (counts[t] || 0) + 1;
  const shown = f.type === "all" ? inRange : inRange.filter((r) => typesOf(r).includes(f.type));
  return { rows: shown, counts, total: rows.length };
}

/** The types this person has anything under at all (the chips worth showing). */
export function typesPresent(rows) {
  const have = new Set(rows.flatMap(typesOf));
  return ACTIVITY_TYPES.filter((t) => have.has(t.key));
}

/** Newest first, by venue-local time. */
export function sortActivity(rows) {
  return rows.sort((a, b) => String(b.at).localeCompare(String(a.at)) || String(b.key).localeCompare(String(a.key)));
}

import { db } from "./db.js";
import { linesFromOrders, consignorShare, round2 } from "./inventory.js";
import { fetchCompletedOrders } from "./square-retail.js";
import { isSquareConfigured } from "./square.js";
import { shiftDate, venueNow, venueToday } from "./constants.js";

/**
 * Months from before the site started pulling sales from Square (server-only).
 *
 * The sales sync began in October 2026 and reached 30 days back, so earlier
 * register sales, room rentals and tickets aren't in retail_sales. For the
 * Money page those months are added up straight from Square and kept here,
 * one row per month. They're deliberately NOT saved as sale lines: a maker's
 * old sale saved as a line would show up as owed to them.
 */

/** "2026-09-01 00:00" (venue wall clock) → the UTC ISO instant. */
export function venueLocalToIso(local) {
  const [d, t = "00:00"] = String(local).split(" ");
  const [y, m, day] = d.split("-").map(Number);
  const [hh, mm] = t.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, day, hh, mm);
  // How far the venue's clock is from UTC at that moment (DST-aware).
  const seen = venueNow(new Date(guess));
  const [sd, st] = seen.split(" ");
  const [sy, sm, sday] = sd.split("-").map(Number);
  const [sh, smin] = st.split(":").map(Number);
  const offset = Date.UTC(sy, sm - 1, sday, sh, smin) - guess;
  return new Date(guess - offset).toISOString();
}

/** When the synced sales begin (venue-local "YYYY-MM-DD HH:MM"), or null with none synced. */
export function salesCoveredFrom() {
  return db.prepare("SELECT MIN(sold_at) AS m FROM retail_sales").get().m || null;
}

/** The part of `month` (if any) from before the synced sales begin: { startIso, endIso }. */
function uncoveredWindow(month) {
  const today = venueToday();
  if (`${month}-01` > today) return null;
  const covered = salesCoveredFrom();
  const next = shiftDate(`${month}-01`, { months: 1 });
  const monthStart = `${month}-01 00:00`;
  const end = covered && covered < `${next} 00:00` ? covered : `${next} 00:00`;
  if (covered && covered <= monthStart) return null;
  // With nothing synced at all, only months already over are read.
  if (!covered && next > today) return null;
  return { startIso: venueLocalToIso(monthStart), endIso: venueLocalToIso(end) };
}

export function getHistory(month) {
  const row = db.prepare("SELECT * FROM square_month_history WHERE month = ?").get(month);
  if (!row) return null;
  try {
    return { ...JSON.parse(row.data), through: row.through, fetchedAt: row.fetched_at };
  } catch {
    return null;
  }
}

/** Square's lines for a window, added up the way the Money page counts them. */
export function summarize(lines) {
  const ownership = db.prepare(
    `SELECT i.ownership, i.split AS item_split, v.default_split AS vendor_split
       FROM inventory_items i LEFT JOIN vendors v ON v.id = i.vendor_id WHERE i.id = ?`
  );
  const t = { shop: 0, makers: 0, rentals: 0, tickets: 0, deposits: 0, salesTax: 0, retail: 0, lines: lines.length };
  for (const l of lines) {
    t.salesTax += l.tax;
    if (l.kind === "rental") t.rentals += l.net;
    else if (l.kind === "ticket") t.tickets += l.net;
    else if (l.kind === "deposit") t.deposits += l.net;
    else if (l.kind === "retail") {
      t.retail += l.net;
      const o = l.item_id ? ownership.get(l.item_id) : null;
      const share = o ? consignorShare({ ...l, ...o }) : 0;
      t.makers += share;
      t.shop += l.net - share;
    }
  }
  for (const k of Object.keys(t)) if (k !== "lines") t[k] = round2(t[k]);
  return t;
}

/**
 * Make sure each of `months` that predates the synced sales has its Square
 * totals saved. Reads Square only for months not saved yet (or whose window
 * moved). Never throws: a month Square can't answer for is just left out.
 */
export async function ensureHistory(months, { refresh = false } = {}) {
  if (!isSquareConfigured()) return;
  for (const month of months) {
    const w = uncoveredWindow(month);
    if (!w) continue;
    const have = getHistory(month);
    if (have && have.through === w.endIso && !refresh) continue;
    try {
      const { orders } = await fetchCompletedOrders(w.startIso, w.endIso);
      const data = summarize(linesFromOrders(orders));
      db.prepare(
        `INSERT INTO square_month_history (month, data, through, fetched_at) VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT (month) DO UPDATE SET data = excluded.data, through = excluded.through, fetched_at = excluded.fetched_at`
      ).run(month, JSON.stringify({ ...data, from: w.startIso }), w.endIso);
    } catch (err) {
      console.error("[money-history] Square read failed for", month, err.message);
    }
  }
}

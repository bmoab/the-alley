import { db } from "./db.js";
import { listDepositsToRefund } from "./deposits.js";
import { countWaitingDropoffs } from "./inventory.js";
import { tagsNeeded } from "./tag-watch.js";
import { shiftDate, venueToday } from "./constants.js";

/**
 * What's waiting on the team, as counts keyed by admin page — the little
 * bubbles in the sidebar and the phone tab bar (server-only). Each count is
 * something only a person can clear: approve a request, settle a deposit,
 * review a listing, count in a drop-off, print its tags, handle a refund given as an amount,
 * send the tenants' staff-cost bills. Things waiting on someone else (a host
 * who hasn't filled in their listing) don't count.
 *
 * Every query is cheap and each is wrapped, so one failing never takes the
 * admin's navigation down with it.
 */
const safe = (fn) => {
  try {
    return Number(fn()) || 0;
  } catch (err) {
    console.error("[attention]", err.message);
    return 0;
  }
};

export function attentionCounts() {
  const today = venueToday();
  return {
    "/admin/requests": safe(() => db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE status = 'pending' AND archived = 0").get().n),
    "/admin/deposits": safe(() => listDepositsToRefund().length),
    "/admin/events": safe(() => db.prepare("SELECT COUNT(*) AS n FROM events WHERE status = 'pending'").get().n),
    "/admin/inventory/dropoffs": safe(() => countWaitingDropoffs()),
    // Items in the shop still waiting for their price tags.
    "/admin/inventory/tags": safe(() => tagsNeeded().length),
    // Refunds given back as an amount in the last 60 days that no returned
    // line accounts for — the maker's share has to be taken back by hand.
    "/admin/sales": safe(
      () =>
        db
          .prepare(
            `SELECT COUNT(*) AS n FROM square_refunds r
              WHERE r.status = 'COMPLETED' AND r.created_at >= ?
                AND NOT EXISTS (SELECT 1 FROM retail_sales s WHERE s.square_order_id = r.order_id AND s.is_return = 1)`
          )
          .get(`${shiftDate(today, { days: -60 })} 00:00`).n
    ),
    // Months already over whose tenant bills haven't gone out (or failed).
    "/admin/staff-costs": safe(
      () =>
        db
          .prepare(
            `SELECT COUNT(DISTINCT m.id) AS n FROM staff_cost_months m
               JOIN staff_cost_shares s ON s.month_id = m.id
              WHERE s.directory_id IS NOT NULL AND s.status IN ('draft', 'failed') AND m.month < ?`
          )
          .get(today.slice(0, 7)).n
    ),
    // Building bills past their due date and not marked paid.
    "/admin/money": safe(
      () =>
        db
          .prepare("SELECT COUNT(*) AS n FROM expenses WHERE paid_on IS NULL AND amount > 0 AND due_date IS NOT NULL AND due_date < ?")
          .get(today).n
    ),
  };
}

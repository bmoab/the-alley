import { whatsMine } from "./accounts.js";
import { accountActivity } from "./account-activity.js";
import { tenantBills, tenantStaffCost, freshMonth, currentMonth } from "./staff-costs.js";
import { sharesStaffCost, upcomingStaffSchedule } from "./staff-schedule.js";
import { makerOverview, needsTerms, getVendor } from "./inventory.js";
import { makerLink } from "./vendor-record.js";
import { reservationsCardData } from "./reservations.js";
import { db } from "./db.js";

/**
 * Everything the account home shows for one email (server-only), as props for
 * AccountDashboard. The same page opens two ways:
 *   - signed in, at /account (`account` given: Latest activity included);
 *   - from a tenant's private link (`viaLink`): no sign-in, so a maker's tile
 *     points at their private maker link instead of the signed-in page.
 */
export async function accountHomeProps({ email, account = null, viaLink = false, mine = null }) {
  mine = mine || whatsMine(email);

  const makerStats = Object.fromEntries(
    mine.makers.map((m) => {
      const o = makerOverview(m.id);
      return [
        m.id,
        {
          onShelf: o.onShelf,
          soFarThisMonth: o.soFarThisMonth,
          due: o.due,
          waiting: o.dropoffs.some((d) => d.status === "submitted"),
          // Agreed before, but the terms or their share changed since.
          termsChanged: !!o.vendor.terms_accepted_at && needsTerms(o.vendor),
        },
      ];
    })
  );
  if (viaLink) {
    const base = (process.env.APP_URL || "").replace(/\/$/, "");
    mine = {
      ...mine,
      makers: mine.makers.map((m) => {
        const v = getVendor(m.id);
        return { ...m, href: v ? makerLink(v).replace(base, "") : null };
      }),
    };
  }

  const bills = Object.fromEntries(mine.businesses.map((b) => [b.id, tenantBills(b.id)]));
  const sharing = mine.businesses.some((b) => sharesStaffCost(b.id));
  const schedule = sharing ? await upcomingStaffSchedule() : null;
  // This month's running figures: rebuilt nightly, and here if a few hours old.
  if (sharing) await freshMonth(currentMonth(), { maxAgeMin: 180 }).catch(() => null);
  const staffCost = Object.fromEntries(mine.businesses.map((b) => [b.id, tenantStaffCost(b.id)]));

  // Alley Reservations, for a business switched on to see every booking.
  const resOwner = mine.businesses.length
    ? db
        .prepare(
          `SELECT sees_reservations, reservations_token FROM directory WHERE sees_reservations = 1 AND reservations_token IS NOT NULL
             AND id IN (${mine.businesses.map(() => "?").join(",")}) LIMIT 1`
        )
        .get(...mine.businesses.map((b) => b.id))
    : null;
  const reservations = reservationsCardData(resOwner);

  const recent = account && !viaLink ? accountActivity(account, mine).rows.slice(0, 5) : [];
  return { mine, makerStats, bills, schedule, staffCost, reservations, recent };
}

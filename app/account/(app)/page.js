import { requireAccount, whatsMine } from "@/lib/accounts.js";
import { accountActivity } from "@/lib/account-activity.js";
import { tenantBills, tenantStaffCost, freshMonth, currentMonth } from "@/lib/staff-costs.js";
import { sharesStaffCost, upcomingStaffSchedule } from "@/lib/staff-schedule.js";
import { makerOverview, needsTerms } from "@/lib/inventory.js";
import { listReservations, reservationsFeedUrl } from "@/lib/reservations.js";
import { db } from "@/lib/db.js";
import { venueToday, shiftDate } from "@/lib/constants.js";
import AccountDashboard from "@/components/account/AccountDashboard.js";

export const metadata = { title: "Your account" };

/**
 * Everything this person has with The Alley, gathered by their (proven) email:
 * consignment, bookings, event listings, a tenant's business listing, an
 * exhibitor page — plus the latest of their Activity.
 */
export default async function AccountHome() {
  const account = await requireAccount();
  const mine = whatsMine(account.email);
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
  const bills = Object.fromEntries(mine.businesses.map((b) => [b.id, tenantBills(b.id)]));
  const sharing = mine.businesses.some((b) => sharesStaffCost(b.id));
  const schedule = sharing ? await upcomingStaffSchedule() : null;
  // This month's running figures: rebuilt nightly, and here if a few hours old.
  if (sharing) await freshMonth(currentMonth(), { maxAgeMin: 180 }).catch(() => null);
  // Alley Reservations, for a business switched on to see every booking.
  const resOwner = mine.businesses.length
    ? db
        .prepare(
          `SELECT reservations_token FROM directory WHERE sees_reservations = 1 AND reservations_token IS NOT NULL
             AND id IN (${mine.businesses.map(() => "?").join(",")}) LIMIT 1`
        )
        .get(...mine.businesses.map((b) => b.id))
    : null;
  const reservations = resOwner
    ? {
        rows: listReservations({ from: venueToday(), to: shiftDate(venueToday(), { days: 20 }) }),
        feedUrl: reservationsFeedUrl(resOwner.reservations_token),
      }
    : null;
  const staffCost = Object.fromEntries(mine.businesses.map((b) => [b.id, tenantStaffCost(b.id)]));
  return (
    <AccountDashboard
      account={account}
      mine={mine}
      recent={accountActivity(account, mine).rows.slice(0, 5)}
      makerStats={makerStats}
      bills={bills}
      schedule={schedule}
      staffCost={staffCost}
      reservations={reservations}
    />
  );
}

import { requireAccount, whatsMine, listInbox } from "@/lib/accounts.js";
import { tenantBills } from "@/lib/staff-costs.js";
import { sharesStaffCost, upcomingStaffSchedule } from "@/lib/staff-schedule.js";
import { makerOverview } from "@/lib/inventory.js";
import AccountDashboard from "@/components/account/AccountDashboard.js";

export const metadata = { title: "Your account" };

/**
 * Everything this person has with The Alley, gathered by their (proven) email:
 * consignment, bookings, event listings, a tenant's business listing, an
 * exhibitor page — plus the newest emails we've sent them.
 */
export default async function AccountHome() {
  const account = await requireAccount();
  const mine = whatsMine(account.email);
  const makerStats = Object.fromEntries(
    mine.makers.map((m) => {
      const o = makerOverview(m.id);
      return [m.id, { onShelf: o.onShelf, soFarThisMonth: o.soFarThisMonth, due: o.due, waiting: o.dropoffs.some((d) => d.status === "submitted") }];
    })
  );
  const bills = Object.fromEntries(mine.businesses.map((b) => [b.id, tenantBills(b.id)]));
  const schedule = mine.businesses.some((b) => sharesStaffCost(b.id)) ? await upcomingStaffSchedule() : null;
  return (
    <AccountDashboard
      account={account}
      mine={mine}
      inbox={listInbox(account.email, { limit: 4 })}
      makerStats={makerStats}
      bills={bills}
      schedule={schedule}
    />
  );
}

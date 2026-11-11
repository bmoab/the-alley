import { requireAccount } from "@/lib/accounts.js";
import { accountHomeProps } from "@/lib/account-home.js";
import AccountDashboard from "@/components/account/AccountDashboard.js";

export const metadata = { title: "Your account" };

/**
 * Everything this person has with The Alley, gathered by their (proven) email:
 * consignment, bookings, event listings, a tenant's business listing, an
 * exhibitor page — plus the latest of their Activity. A tenant's private
 * business link opens this same page (app/business-listing/[token]/page.js).
 */
export default async function AccountHome() {
  const account = await requireAccount();
  const props = await accountHomeProps({ email: account.email, account });
  return <AccountDashboard account={account} {...props} />;
}

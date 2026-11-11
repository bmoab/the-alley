import { redirect } from "next/navigation";
import { getDirectoryByToken } from "@/lib/catalog.js";
import { getAccount, getAccountByEmail } from "@/lib/accounts.js";
import { normalizeEmail } from "@/lib/portal.js";
import { accountHomeProps } from "@/lib/account-home.js";
import AccountDashboard from "@/components/account/AccountDashboard.js";
import AccountNudge from "@/components/account/AccountNudge.js";
import PortalFrame, { PortalMissing } from "@/components/account/PortalFrame.js";

export const metadata = { title: "Your account" };

// Per-token page: never cache one tenant's view and serve it to another.
export const dynamic = "force-dynamic";

/**
 * A tenant's private link: the same account home they'd see signed in, at the
 * link they already have — their business first, then bills, staff cost, Alley
 * Reservations and everything else under their email. Editing the listing and
 * their events lives one tap in, at /business-listing/<token>/edit.
 *
 * Signed in as that email already? Then it's just their account.
 */
export default async function BusinessHome({ params }) {
  const entry = getDirectoryByToken(params.token);
  if (!entry) {
    return (
      <PortalFrame label="Your account">
        <PortalMissing>
          This link is invalid or has expired. Check your email for the right link, or sign in to your account.
        </PortalMissing>
      </PortalFrame>
    );
  }

  const email = normalizeEmail(entry.contact_email);
  const signedIn = await getAccount();
  if (email && signedIn && normalizeEmail(signedIn.email) === email) redirect("/account");

  // No email on file: just this business (an empty email would match others).
  const token = params.token;
  const props = await accountHomeProps({
    email,
    viaLink: true,
    mine: email
      ? null
      : {
          bookings: { total: 0, upcoming: 0, portalToken: null },
          listings: [],
          businesses: [{ id: entry.id, business_name: entry.business_name, token }],
          exhibitors: [],
          makers: [],
        },
  });
  // This link's business always leads, even if another shares the email.
  const businesses = props.mine.businesses.some((b) => b.id === entry.id)
    ? props.mine.businesses
    : [{ id: entry.id, business_name: entry.business_name, token }, ...props.mine.businesses];
  businesses.sort((a, b) => (a.id === entry.id ? -1 : b.id === entry.id ? 1 : 0));

  const who = (email && getAccountByEmail(email)) || null;
  const account = { name: who?.name || "", email: email || "" };

  return (
    <PortalFrame label="Your account" wide>
      <AccountDashboard account={account} {...props} mine={{ ...props.mine, businesses }} viaLink />
      <AccountNudge email={email} hub />
    </PortalFrame>
  );
}

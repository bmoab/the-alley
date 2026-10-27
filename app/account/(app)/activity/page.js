import { requireAccount, whatsMine } from "@/lib/accounts.js";
import { accountActivity } from "@/lib/account-activity.js";
import { fillMissingPayments } from "@/lib/payment-details.js";
import { readFilters, filterActivity, typesPresent } from "@/lib/activity-feed.js";
import ActivityFeed from "@/components/account/ActivityFeed.js";

export const metadata = { title: "Activity" };
export const dynamic = "force-dynamic";

/**
 * Everything that's happened on this account — bookings, payments with their
 * card and receipt, sales, drop-offs, payouts, agreements, every email — with
 * filters in the address (?type=, ?period= or ?from=&to=, ?q=), so a filtered
 * view can be bookmarked or shared with us.
 */
export default async function ActivityPage({ searchParams }) {
  const account = await requireAccount("/account/activity");
  const mine = whatsMine(account.email);
  let { rows, invoices } = accountActivity(account, mine);
  // Card and receipt details Square hasn't given us yet: a few, quickly.
  const got = await fillMissingPayments({ only: invoices, limit: 8, ms: 4000 });
  if (got.filled) ({ rows } = accountActivity(account, mine));

  const f = readFilters(searchParams);
  const { rows: shown, counts, total } = filterActivity(rows, f);
  return (
    <ActivityFeed
      email={account.email}
      rows={shown}
      f={f}
      counts={counts}
      types={typesPresent(rows)}
      total={total}
      hrefFor={(q) => `/account/activity${q}`}
      action="/account/activity"
      emailHref={(id) => `/account/activity/email/${id}`}
    />
  );
}

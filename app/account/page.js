import Link from "next/link";
import { requireAccount, whatsMine, listInbox } from "@/lib/accounts.js";
import { makerOverview } from "@/lib/inventory.js";
import { formatDate, formatDateShort, formatMoney } from "@/lib/constants.js";
import Card from "@/components/admin/ui/Card.js";
import Badge from "@/components/admin/ui/Badge.js";

export const metadata = { title: "Your account" };

const LISTING_STATUS = {
  draft: { tone: "warning", label: "not finished" },
  pending: { tone: "warning", label: "waiting for review" },
  live: { tone: "success", label: "on our calendar" },
};

function Section({ title, children, action }) {
  return (
    <Card pad="md">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {action}
      </div>
      <div className="mt-2">{children}</div>
    </Card>
  );
}

/**
 * Everything this person has with The Alley, gathered by their (proven) email:
 * consignment, bookings, event listings, a tenant's business listing, an
 * exhibitor page — plus the newest emails we've sent them.
 */
export default async function AccountHome() {
  const account = await requireAccount();
  const mine = whatsMine(account.email);
  const inbox = listInbox(account.email, { limit: 3 });
  const nothing =
    !mine.makers.length && !mine.bookings.total && !mine.listings.length && !mine.businesses.length && !mine.exhibitors.length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Hi{account.name ? `, ${account.name.split(" ")[0]}` : ""}</h1>
        <p className="mt-1 text-sm text-ink-muted">Everything you have with The Alley, under {account.email}.</p>
      </div>

      {mine.makers.map((m) => {
        const o = makerOverview(m.id);
        return (
          <Section
            key={m.id}
            title={`Consignment · ${m.name}`}
            action={
              <Link href={`/account/consign/${m.id}`} className="text-sm font-semibold text-ink underline">
                Open →
              </Link>
            }
          >
            <p className="text-sm text-ink-soft">
              {o.onShelf} on the shelf · {formatMoney(o.soFarThisMonth)} yours so far this month
              {o.due ? ` · ${formatMoney(o.due)} payout coming` : ""}
            </p>
            {o.dropoffs.some((d) => d.status === "submitted") ? (
              <p className="mt-1 text-xs text-ink-muted">You have a drop-off waiting to be brought in.</p>
            ) : null}
          </Section>
        );
      })}

      {mine.bookings.total ? (
        <Section
          title="Room bookings"
          action={
            <Link href={`/my-bookings/${mine.bookings.portalToken}`} className="text-sm font-semibold text-ink underline">
              See them all →
            </Link>
          }
        >
          <p className="text-sm text-ink-soft">
            {mine.bookings.upcoming
              ? `${mine.bookings.upcoming} coming up`
              : "Nothing coming up"}{" "}
            · {mine.bookings.total} in all. Pay, see what you owe or change a date there.
          </p>
        </Section>
      ) : null}

      {mine.listings.length ? (
        <Section title="Your event listings">
          <ul className="divide-y divide-line text-sm">
            {mine.listings.map((e) => {
              const st = LISTING_STATUS[e.status] || { tone: "neutral", label: e.status };
              return (
                <li key={e.id} className="flex flex-wrap items-center gap-2 py-2">
                  <Link href={`/host-listing/${e.host_token}`} className="font-semibold text-ink hover:underline">
                    {e.title || "Untitled event"}
                  </Link>
                  {e.date ? <span className="text-ink-muted">{formatDate(e.date)}</span> : null}
                  <Badge tone={st.tone}>{st.label}</Badge>
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}

      {mine.businesses.map((b) => (
        <Section
          key={b.id}
          title={`Your business · ${b.business_name}`}
          action={
            <Link href={`/business-listing/${b.token}`} className="text-sm font-semibold text-ink underline">
              Edit →
            </Link>
          }
        >
          <p className="text-sm text-ink-soft">Your directory listing and the events you post on our calendar.</p>
        </Section>
      ))}

      {mine.exhibitors.map((x) => (
        <Section
          key={x.id}
          title={`Exhibitor page · ${x.name}`}
          action={
            <Link href={`/exhibitor/${x.token}`} className="text-sm font-semibold text-ink underline">
              Edit →
            </Link>
          }
        >
          <p className="text-sm text-ink-soft">Your profile and artwork in our gallery.</p>
        </Section>
      ))}

      {nothing ? (
        <Card pad="md">
          <p className="text-sm text-ink-soft">
            Nothing here under {account.email} yet. Once you book a room, list an event or sell with us, it shows up here.
            Used a different email with us before? Ask us to update it.
          </p>
          <p className="mt-3 flex flex-wrap gap-3 text-sm">
            <Link href="/book" className="font-semibold text-ink underline">Book a room</Link>
            <Link href="/contact" className="font-semibold text-ink underline">Sell your work in the shop</Link>
          </p>
        </Card>
      ) : null}

      <Section
        title="Latest from us"
        action={
          <Link href="/account/inbox" className="text-sm font-semibold text-ink underline">
            Inbox →
          </Link>
        }
      >
        {inbox.length ? (
          <ul className="divide-y divide-line text-sm">
            {inbox.map((m) => (
              <li key={m.id} className="flex items-baseline justify-between gap-3 py-2">
                <Link href={`/account/inbox/${m.id}`} className="truncate text-ink hover:underline">
                  {m.subject}
                </Link>
                <span className="shrink-0 text-xs text-ink-muted">{formatDateShort(m.sent_at.slice(0, 10))}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-muted">A copy of every email we send you will be kept here.</p>
        )}
      </Section>
    </div>
  );
}

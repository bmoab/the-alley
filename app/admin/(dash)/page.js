import Link from "next/link";
import {
  Inbox,
  Clock,
  Palette,
  Tags,
  CalendarDays,
  Megaphone,
  PackageOpen,
  Wallet,
  Receipt,
  Coins,
  Handshake,
  ChartNoAxesCombined,
  RefreshCw,
  ChevronRight,
  CircleCheck,
} from "lucide-react";
import { requireAdmin, canManageBookings, canManageStaff } from "@/lib/auth.js";
import { listBookings } from "@/lib/bookings.js";
import { attentionCounts } from "@/lib/attention.js";
import { adminCalendarItems } from "@/lib/calendar-items.js";
import { listDropoffs, salesSummary, consignorBalances, payoutCutoff } from "@/lib/inventory.js";
import { refreshTagWatch, tagsNeeded } from "@/lib/tag-watch.js";
import { remindersDue, possessive } from "@/lib/agreement-reminders.js";
import { isSquareConfigured } from "@/lib/square.js";
import { getSetting } from "@/lib/db.js";
import {
  BOOKING_STATUS,
  SPACE_BY_ID,
  formatDate,
  formatDateShort,
  formatTime,
  formatMoney,
  shiftDate,
  venueToday,
  venueDayOf,
} from "@/lib/constants.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import StatCard from "@/components/admin/ui/StatCard.js";
import Card from "@/components/admin/ui/Card.js";
import Button from "@/components/admin/ui/Button.js";
import { cx } from "@/components/admin/ui/cx.js";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// A section's heading: title on the left, a "see all" link on the right.
function SectionHead({ title, href, linkLabel = "See all" }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {href ? (
        <Link href={href} className="text-xs font-semibold text-verde-deep hover:underline">
          {linkLabel}
        </Link>
      ) : null}
    </div>
  );
}

// One line of the "Needs you" list.
function TodoRow({ icon: Icon, label, hint, href, muted }) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 px-1 py-2.5 transition hover:bg-paper-dim">
        <span
          className={cx(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            muted ? "bg-ink/5 text-ink-muted" : "bg-verde-deep/15 text-verde-deep"
          )}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={cx("block text-sm font-semibold", muted ? "text-ink-soft" : "text-ink")}>{label}</span>
          {hint ? <span className="block text-xs text-ink-muted">{hint}</span> : null}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
      </Link>
    </li>
  );
}

/**
 * The admin home: what's waiting on the team today (requests, drop-offs,
 * listings, refunds, bills, maker payouts), what's on the calendar this week,
 * the drop-offs makers are bringing in and how the shop is selling. Each
 * section links to the page where the work is actually done.
 */
export default async function AdminDashboard() {
  const user = await requireAdmin();
  const manageBookings = canManageBookings(user);
  const manageStaff = canManageStaff(user);
  const counts = attentionCounts();
  const today = venueToday();
  const weekEnd = shiftDate(today, { days: 6 });

  // ── This week on the calendar (the same chips the Events calendar draws) ──
  const week = adminCalendarItems()
    .filter((i) => i.kind !== "cancelled" && i.date >= today && i.date <= weekEnd)
    .sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
  const held = listBookings({ status: BOOKING_STATUS.HELD });

  // ── Drop-offs makers have listed and not brought in yet ──
  const dropoffs = listDropoffs({ status: "submitted" });
  // ── Items in the shop still waiting for price tags: drop-offs counted in
  // here, and anything added or restocked straight in Square ──
  await refreshTagWatch().catch((err) => console.error("[tags] Square check failed", err.message));
  const untagged = tagsNeeded();
  const untaggedCount = untagged.reduce((t, s) => t + (s.unknown ? 1 : s.need), 0);
  const unknownCount = untagged.filter((s) => s.unknown).length;

  // ── Shop sales (pulled from Square nightly, or with "Pull now") ──
  const shopSales = (from) => {
    const s = salesSummary(from, today);
    const units = s.lines.filter((l) => l.kind === "retail").reduce((t, l) => t + (Number(l.qty) || 0), 0);
    return { ...s.retail, units };
  };
  const last7 = shopSales(shiftDate(today, { days: -6 }));
  const month = shopSales(`${today.slice(0, 7)}-01`);
  const lastRun = getSetting("square_sales_last_run", "");
  const syncStale = isSquareConfigured() && (!lastRun || Date.now() - Date.parse(lastRun) > 36 * 3600 * 1000);

  // ── Makers to pay: last month's sales, due by the 15th ──
  const cutoff = payoutCutoff(today);
  const due = Object.values(consignorBalances({ through: cutoff })).filter((b) => b.owed > 0);
  const dueTotal = due.reduce((t, b) => t + b.owed, 0);
  const payoutMonth = new Date(cutoff + "T12:00:00").toLocaleDateString("en-US", { month: "long" });

  // ── Needs you: only what's waiting and only what this person can act on ──
  const n = (href) => counts[href] || 0;
  const todo = [
    manageBookings && n("/admin/requests") && {
      icon: Inbox,
      label: `${plural(n("/admin/requests"), "booking request")} to approve or deny`,
      href: "/admin/requests",
    },
    n("/admin/inventory/dropoffs") && {
      icon: PackageOpen,
      label: `${plural(n("/admin/inventory/dropoffs"), "drop-off")} to count in`,
      hint: "Count it with the maker, receive it, print the tags",
      href: "/admin/inventory/dropoffs",
    },
    untagged.length && {
      icon: Tags,
      label: `Price tags to print for ${plural(untagged.length, "item")}`,
      hint: unknownCount
        ? `${plural(unknownCount, "new item")} in Square — count them and print`
        : `${plural(untaggedCount, "tag")} in all`,
      href: "/admin/inventory/tags?needed=1",
    },
    ...remindersDue(today).map((r) => ({
      icon: Palette,
      label: `${possessive(r.name)} consignment agreement ends ${formatDateShort(r.endsOn).split(",").slice(0, 2).join("")} — send the ${r.label}`,
      hint: r.daysLeft === 0 ? "Ends today" : `Ends in ${plural(r.daysLeft, "day")} · Already written, just read it and send`,
      href: `/admin/agreements/${r.party}/${r.id}?kind=${r.kind}`,
    })),
    n("/admin/events") && {
      icon: Megaphone,
      label: `${plural(n("/admin/events"), "event listing")} to review`,
      hint: "Marked “Review” in the list",
      href: "/admin/events",
    },
    manageBookings && n("/admin/deposits") && {
      icon: Wallet,
      label: `${plural(n("/admin/deposits"), "deposit")} to settle`,
      href: "/admin/deposits",
    },
    n("/admin/sales") && {
      icon: Receipt,
      label: `${plural(n("/admin/sales"), "refund")} to fix by hand`,
      hint: "Refunded as an amount — take the maker's share back",
      href: "/admin/sales",
    },
    manageStaff && due.length && {
      icon: Handshake,
      label: `Pay ${plural(due.length, "maker")} for ${payoutMonth} — ${formatMoney(dueTotal)}`,
      hint: "Due by the 15th",
      href: "/admin/vendors",
    },
    manageStaff && n("/admin/staff-costs") && {
      icon: Coins,
      label: `Shared staff cost: ${plural(n("/admin/staff-costs"), "month")} of tenant bills to send`,
      href: "/admin/staff-costs",
    },
    manageStaff && n("/admin/money") && {
      icon: ChartNoAxesCombined,
      label: `${plural(n("/admin/money"), "building bill")} past due`,
      href: "/admin/money/bills",
    },
    syncStale && {
      icon: RefreshCw,
      label: "Square sales haven't been pulled lately",
      hint: lastRun ? `Last pulled ${formatDateShort(venueToday(new Date(lastRun)))} — press Pull now` : "Press Pull now",
      href: "/admin/sales",
    },
  ].filter(Boolean);
  // Waiting on someone else — shown, but nothing to do yet.
  const waiting = [
    held.length && {
      icon: Clock,
      label: `${plural(held.length, "booking")} waiting on payment`,
      hint: "Held until the client pays the invoice",
      href: "/admin/events?status=held&preset=all",
      muted: true,
    },
  ].filter(Boolean);

  return (
    <div>
      <PageHeader eyebrow="Overview" title="Dashboard" subtitle={`${formatDate(today)} — what's waiting today and what's coming up.`} />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="To do"
          value={todo.length}
          hint={todo.length ? "Things waiting on you" : "All caught up"}
          icon={CircleCheck}
          accent
        />
        <StatCard
          label="Events this week"
          value={week.length}
          href="/admin/events"
          hint="Next 7 days"
          icon={CalendarDays}
        />
        <StatCard
          label="Drop-offs coming"
          value={dropoffs.length}
          href="/admin/inventory/dropoffs"
          hint="Listed by makers"
          icon={PackageOpen}
        />
        <StatCard
          label="Shop sales"
          value={formatMoney(last7.net)}
          href="/admin/sales"
          hint="Last 7 days"
          icon={Receipt}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card pad="md">
          <SectionHead title="Needs you" />
          {todo.length || waiting.length ? (
            <ul className="-mx-1 divide-y divide-line">
              {[...todo, ...waiting].map((t) => (
                <TodoRow key={t.label} {...t} />
              ))}
            </ul>
          ) : null}
          {!todo.length ? (
            <p className={cx("text-sm text-ink-soft", waiting.length && "mt-3")}>Nothing waiting on you — all caught up.</p>
          ) : null}
        </Card>

        <Card pad="md">
          <SectionHead title="This week" href="/admin/events" linkLabel="List of events" />
          {week.length ? (
            <ul className="-mx-1 divide-y divide-line">
              {week.map((e) => {
                const room = SPACE_BY_ID[String(e.kind).replace(/-private$/, "")]?.name;
                const isPublic = !String(e.kind).endsWith("-private") && e.kind !== "eventHidden";
                return (
                  <li key={`${e.href}|${e.date}`}>
                    <Link href={e.href} className="flex items-start gap-3 px-1 py-2.5 transition hover:bg-paper-dim">
                      <span
                        className={cx(
                          "w-20 shrink-0 whitespace-nowrap text-xs font-semibold leading-5",
                          e.date === today ? "text-verde-deep" : "text-ink-muted"
                        )}
                      >
                        {e.date === today ? "Today" : formatDateShort(e.date).split(",").slice(0, 2).join("")}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">{e.title}</span>
                        <span className="block text-xs text-ink-muted">
                          {[e.time ? formatTime(e.time) : null, room].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <span
                        className={cx(
                          "mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          isPublic ? "bg-verde/60 text-ink-soft" : "bg-ink/5 text-ink-soft"
                        )}
                      >
                        {isPublic ? "Public" : "Private"}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-ink-soft">Nothing on the calendar in the next 7 days.</p>
          )}
        </Card>

        <Card pad="md">
          {untagged.length ? (
            <div className="mb-5">
              <SectionHead title="Tags to print" href="/admin/inventory/tags?needed=1" linkLabel="Print them" />
              <ul className="-mx-1 divide-y divide-line">
                {untagged.slice(0, 6).map((s) => (
                  <li key={s.variationId} className="flex items-center gap-3 px-1 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{s.name}</span>
                      <span className="block truncate text-xs text-ink-muted">{s.detail}</span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                      {s.unknown ? "New — count it" : plural(s.need, "tag")}
                    </span>
                  </li>
                ))}
              </ul>
              {untagged.length > 6 ? (
                <p className="mt-2 text-xs text-ink-muted">And {plural(untagged.length - 6, "more item")}.</p>
              ) : null}
              <div className="mt-3">
                <Button href="/admin/inventory/tags?needed=1" size="sm" variant="accent">
                  Print these tags
                </Button>
              </div>
            </div>
          ) : null}
          <SectionHead title="Drop-offs coming in" href="/admin/inventory/dropoffs" />
          {dropoffs.length ? (
            <ul className="-mx-1 divide-y divide-line">
              {dropoffs.slice(0, 6).map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-3 px-1 py-2.5">
                  <span className="min-w-0 flex-1">
                    <Link href={`/admin/vendors/${d.vendor_id}`} className="block truncate text-sm font-semibold text-ink hover:underline">
                      {d.vendor_name}
                    </Link>
                    <span className="block text-xs text-ink-muted">
                      {plural(d.units, "item")} · {formatMoney(d.value)} · Listed {formatDateShort(venueDayOf(d.created_at))}
                    </span>
                  </span>
                  <Button href={`/admin/inventory/receive?dropoff=${d.id}`} size="sm" variant="ghost">
                    Count it in
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-soft">
              No drop-offs listed. Makers list what they&apos;re bringing from their account, and it shows up here.
            </p>
          )}
        </Card>

        <Card pad="md">
          <SectionHead title="The shop" href="/admin/sales" linkLabel="Sales" />
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-xs text-ink-muted">Last 7 days</dt>
              <dd className="text-xl font-semibold tabular-nums text-ink">{formatMoney(last7.net)}</dd>
              <dd className="text-xs text-ink-muted">{plural(last7.units, "item")} sold</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">This month so far</dt>
              <dd className="text-xl font-semibold tabular-nums text-ink">{formatMoney(month.net)}</dd>
              <dd className="text-xs text-ink-muted">{plural(month.units, "item")} sold</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-ink-muted">
            Shop sales before tax, from Square. Last pulled{" "}
            {lastRun
              ? new Date(lastRun).toLocaleString("en-US", { timeZone: "America/Denver", dateStyle: "medium", timeStyle: "short" })
              : "never"}
            .
          </p>
        </Card>
      </div>
    </div>
  );
}

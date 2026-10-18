import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaffManager } from "@/lib/auth.js";
import { MONTH_RE, monthLabel, moneyOverview, markRent, unmarkRent, thisMonth } from "@/lib/money.js";
import { formatDateShort, formatMoney, shiftDate } from "@/lib/constants.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import Card from "@/components/admin/ui/Card.js";
import Button from "@/components/admin/ui/Button.js";
import Badge from "@/components/admin/ui/Badge.js";
import { Bars, Delta, TrendChart } from "@/components/admin/money/Charts.js";

export const metadata = { title: "Money" };
export const dynamic = "force-dynamic";

const PATH = "/admin/money";
const back = (month, msg, type = "success") => {
  revalidatePath(PATH);
  redirect(`${PATH}?month=${month}${msg ? `&toast=${encodeURIComponent(msg)}&toastType=${type}` : ""}`);
};
const monthOf = (fd) => (MONTH_RE.test(String(fd.get("month") || "")) ? String(fd.get("month")) : thisMonth());

async function rentPaid(formData) {
  "use server";
  await requireStaffManager();
  const month = monthOf(formData);
  try {
    markRent(formData.get("directory_id"), month, { amount: formData.get("amount") });
  } catch (err) {
    back(month, err.message, "error");
  }
  back(month, "Rent marked paid.");
}

async function rentUndo(formData) {
  "use server";
  await requireStaffManager();
  const month = monthOf(formData);
  unmarkRent(formData.get("directory_id"), month);
  back(month, "Rent unmarked.", "neutral");
}

function Stat({ label, value, sub, tone }) {
  return (
    <Card pad="md" className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{label}</p>
      <p className={`mt-1 text-3xl font-semibold tabular-nums ${tone === "bad" ? "text-rust" : tone === "good" ? "text-verde-deep" : "text-ink"}`}>
        {value}
      </p>
      <div className="mt-1 min-h-[1rem]">{sub}</div>
    </Card>
  );
}

function Owed({ label, amount, href, note }) {
  const body = (
    <span className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <span className="text-ink-soft">
        {label}
        {note ? <span className="ml-1 text-xs text-ink-muted">{note}</span> : null}
      </span>
      <span className={`font-semibold tabular-nums ${amount ? "text-ink" : "text-ink-muted"}`}>{formatMoney(amount)}</span>
    </span>
  );
  return href ? (
    <Link href={href} className="block rounded px-1 -mx-1 hover:bg-paper-dim">
      {body}
    </Link>
  ) : (
    <div>{body}</div>
  );
}

export default async function MoneyPage({ searchParams }) {
  await requireStaffManager();
  const month = MONTH_RE.test(searchParams?.month || "") ? searchParams.month : thisMonth();
  const o = await moneyOverview(month);
  const prev = shiftDate(`${month}-01`, { months: -1 }).slice(0, 7);
  const next = shiftDate(`${month}-01`, { months: 1 }).slice(0, 7);
  const { start, end } = { start: `${month}-01`, end: shiftDate(`${next}-01`, { days: -1 }) };
  const salesHref = `/admin/sales?from=${start}&to=${end}`;
  const billsHref = `${PATH}/bills?month=${month}`;
  const unenteredBills = o.bills.filter((b) => b.amount == null).length;
  const rentUnpaid = o.rent.filter((r) => !r.payment);

  const incomeRows = [
    { label: "Shop", amount: o.income.shop, href: salesHref, note: "our items + our share of makers'" },
    { label: "Room rentals", amount: o.income.rentals, href: `/admin/events?status=all&from=${start}&to=${end}` },
    { label: "Event tickets", amount: o.income.tickets, href: salesHref },
    { label: "Tenants' rent", amount: o.income.rent, href: "#rent" },
    { label: "Tenants' share of staff", amount: o.income.staffShares, href: `/admin/staff-costs?month=${month}` },
    { label: "Utility shares", amount: o.income.coPayers, href: billsHref, note: "Jay's third" },
  ];
  const costRows = [
    { label: "Makers' share of sales", amount: o.costs.makers, href: "/admin/vendors" },
    { label: "Staff", amount: o.costs.staff, href: `/admin/staff-costs?month=${month}`, note: o.staffAddedUp ? "" : "not added up yet" },
    { label: "Mortgage", amount: o.costs.mortgage, href: billsHref },
    { label: "Utilities", amount: o.costs.utilities, href: billsHref },
    { label: "Insurance", amount: o.costs.insurance, href: billsHref },
    { label: "Property tax", amount: o.costs.tax, href: billsHref },
    { label: "Supplies & upkeep", amount: o.costs.supplies, href: billsHref },
    { label: "Other bills", amount: o.costs.other, href: billsHref },
  ];
  const toUs = o.owing.toUs;
  const owedToUs = toUs.rent + toUs.staffBills + toUs.coPayers + toUs.bookings;

  return (
    <div>
      <PageHeader
        title="Money"
        subtitle="The whole Alley at a glance — what came in, what went out, what's owed, and what's doing best. Tap anything for the detail."
        actions={
          <Button href={billsHref} size="sm">
            Bills{unenteredBills ? ` · ${unenteredBills} to enter` : ""}
          </Button>
        }
      />

      {/* Month switcher */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Button href={`${PATH}?month=${prev}`} variant="ghost" size="sm">← {monthLabel(prev)}</Button>
        <span className="rounded-lg bg-ink px-3 py-1.5 text-sm font-semibold text-paper">{monthLabel(month)}</span>
        {month < thisMonth() ? <Button href={`${PATH}?month=${next}`} variant="ghost" size="sm">{monthLabel(next)} →</Button> : null}
        {month !== thisMonth() ? <Button href={PATH} variant="subtle" size="sm">This month</Button> : null}
      </div>

      {/* The three numbers */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Money in" value={formatMoney(o.totalIn)} sub={<Delta now={o.totalIn} before={o.last.totalIn} good="up" />} />
        <Stat label="Money out" value={formatMoney(o.totalOut)} sub={<Delta now={o.totalOut} before={o.last.totalOut} good="down" />} />
        <Stat
          label={o.net >= 0 ? "Left over" : "Short"}
          value={formatMoney(Math.abs(o.net))}
          tone={o.net >= 0 ? "good" : "bad"}
          sub={<Delta now={o.net} before={o.last.net} good="up" />}
        />
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        Not counted as ours: <strong className="text-ink-soft">{formatMoney(o.salesTax)}</strong> sales tax collected (set aside for the state)
        {o.depositsTaken ? (
          <>
            {" "}and <strong className="text-ink-soft">{formatMoney(o.depositsTaken)}</strong> in refundable deposits
          </>
        ) : null}
        .{unenteredBills ? <> · <Link href={billsHref} className="font-semibold text-rust underline">{unenteredBills} of this month&apos;s bills still need an amount</Link></> : null}
      </p>

      {/* In / out */}
      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card pad="md">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold text-ink">Where it came from</h2>
            <span className="text-sm font-semibold tabular-nums text-verde-deep">{formatMoney(o.totalIn)}</span>
          </div>
          <div className="mt-4">
            <Bars rows={incomeRows} tone="in" empty="No money in yet this month." />
          </div>
        </Card>
        <Card pad="md">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold text-ink">Where it went</h2>
            <span className="text-sm font-semibold tabular-nums text-ink-soft">{formatMoney(o.totalOut)}</span>
          </div>
          <div className="mt-4">
            <Bars rows={costRows} tone="out" empty="No costs entered yet — add this month's bills." />
          </div>
          <p className="mt-3 text-xs text-ink-muted">
            <Link href={billsHref} className="font-semibold text-ink underline">Enter or pay this month&apos;s bills →</Link>
          </p>
        </Card>
      </div>

      {/* Trend */}
      <Card pad="md" className="mt-4">
        <h2 className="font-semibold text-ink">The last 12 months</h2>
        <div className="mt-3">
          <TrendChart data={o.trend} current={month} href={(m) => `${PATH}?month=${m}`} />
        </div>
      </Card>

      {/* Owed */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card pad="md">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold text-ink">Owed to us</h2>
            <span className="text-sm font-semibold tabular-nums text-ink">{formatMoney(owedToUs)}</span>
          </div>
          <div className="mt-2 divide-y divide-line/60">
            <Owed label="Rent not yet in" note={monthLabel(month)} amount={toUs.rent} href="#rent" />
            <Owed label="Tenants' staff-cost bills" amount={toUs.staffBills} href="/admin/staff-costs" />
            <Owed label="Utility shares (Jay)" amount={toUs.coPayers} href={billsHref} />
            <Owed label="Room bookings not paid" amount={toUs.bookings} href="/admin/events?status=all" />
          </div>
        </Card>
        <Card pad="md">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold text-ink">We owe</h2>
            <span className="text-sm font-semibold tabular-nums text-ink">
              {formatMoney(o.owing.fromUs.bills + o.owing.fromUs.makers + o.salesTax)}
            </span>
          </div>
          <div className="mt-2 divide-y divide-line/60">
            <Owed label="Bills not paid yet" amount={o.owing.fromUs.bills} href={billsHref} />
            <Owed label="Makers, not paid out yet" amount={o.owing.fromUs.makers} href="/admin/vendors" />
            <Owed label="Sales tax collected this month" amount={o.salesTax} href={salesHref} note="due to the state" />
          </div>
          {o.owing.fromUs.overdue.length ? (
            <p className="mt-3 rounded-lg bg-rust/10 px-3 py-2 text-sm text-rust">
              Past due: {o.owing.fromUs.overdue.map((b) => `${b.name} (${formatMoney(b.amount)}, ${monthLabel(b.month)})`).join(", ")}
            </p>
          ) : null}
        </Card>
      </div>

      {/* Best & worst */}
      <h2 className="mb-2 mt-7 text-lg font-semibold text-ink">What&apos;s doing best — and worst</h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card pad="md">
          <h3 className="font-semibold text-ink">Rooms</h3>
          <p className="text-xs text-ink-muted">Rentals with an event this month · {o.events} public event{o.events === 1 ? "" : "s"} on the calendar</p>
          <div className="mt-3">
            <Bars
              rows={o.rooms.map((r) => ({ label: r.name, amount: r.amount, note: `${r.bookings} booking${r.bookings === 1 ? "" : "s"} · ${Math.round(r.hours)}h` }))}
              empty="No rooms booked this month."
            />
          </div>
        </Card>
        <Card pad="md">
          <h3 className="font-semibold text-ink">Top makers</h3>
          <p className="text-xs text-ink-muted">What their items sold for this month</p>
          <div className="mt-3">
            <Bars
              rows={o.makers.top.slice(0, 6).map((m) => ({ label: m.name, amount: m.net, note: `${m.qty} sold`, href: `/admin/vendors/${m.id}` }))}
              empty="No makers' sales yet this month."
            />
          </div>
        </Card>
        <Card pad="md">
          <h3 className="font-semibold text-ink">Best sellers</h3>
          <p className="text-xs text-ink-muted">Shop items this month</p>
          <div className="mt-3">
            <Bars rows={o.topItems.map((i) => ({ label: i.name, amount: i.net, note: `× ${i.qty}` }))} empty="Nothing sold yet this month." />
          </div>
        </Card>
      </div>
      {o.makers.slow.length ? (
        <Card pad="md" className="mt-4">
          <h3 className="font-semibold text-ink">Not selling</h3>
          <p className="text-xs text-ink-muted">Makers with items on the shelf and no sale in 60 days — worth a swap-out or a chat.</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {o.makers.slow.map((m) => (
              <li key={m.id}>
                <Link href={`/admin/vendors/${m.id}`} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-sm text-ink hover:border-ink/40">
                  {m.name} <span className="text-xs text-ink-muted">{m.on_shelf} on shelf</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* Stock + rent */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card pad="md">
          <h3 className="font-semibold text-ink">On the shelves</h3>
          {o.stock ? (
            <>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-ink">{formatMoney(o.stock.total)}</p>
              <p className="text-xs text-ink-muted">
                everything in the shop at shelf price · {o.stock.units} items, {o.stock.products} products
              </p>

              <div className="mt-4 rounded-xl border border-line p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-ink">Bought by The Alley</p>
                  <p className="font-semibold tabular-nums text-ink">{formatMoney(o.stock.bought.value)}</p>
                </div>
                <p className="text-xs text-ink-muted">
                  {o.stock.bought.units} items · all of it is ours when it sells
                </p>
                {o.stock.bought.byCategory.length ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-semibold text-ink-soft">By category</summary>
                    <ul className="mt-1 space-y-0.5 text-xs text-ink-soft">
                      {o.stock.bought.byCategory.map((c) => (
                        <li key={c.name} className="flex justify-between gap-2">
                          <span className="truncate">{c.name} · {c.units}</span>
                          <span className="tabular-nums">{formatMoney(c.value)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </div>

              <div className="mt-2 rounded-xl border border-line p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-ink">Brought in by makers</p>
                  <p className="font-semibold tabular-nums text-ink">{formatMoney(o.stock.consigned.value)}</p>
                </div>
                <p className="text-xs text-ink-muted">
                  {o.stock.consigned.units} items on consignment · our share if it all sells:{" "}
                  <strong className="text-ink-soft">{formatMoney(o.stock.consigned.ours)}</strong>
                </p>
                {o.stock.consigned.byMaker.length ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-semibold text-ink-soft">By maker</summary>
                    <ul className="mt-1 space-y-0.5 text-xs text-ink-soft">
                      {o.stock.consigned.byMaker.map((m) => (
                        <li key={m.name} className="flex justify-between gap-2">
                          {m.vendorId ? (
                            <Link href={`/admin/vendors/${m.vendorId}`} className="truncate hover:underline">{m.name} · {m.units}</Link>
                          ) : (
                            <span className="truncate">{m.name} · {m.units}</span>
                          )}
                          <span className="tabular-nums">{formatMoney(m.value)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </div>
              {o.stock.simulated ? <p className="mt-2 text-xs text-ink-muted">Square isn&apos;t connected here, so this counts the makers&apos; items only.</p> : null}
            </>
          ) : (
            <p className="mt-2 text-sm text-ink-muted">Couldn&apos;t reach Square for the counts just now.</p>
          )}
        </Card>

        <Card pad="md" id="rent">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-semibold text-ink">Rent · {monthLabel(month)}</h3>
            <span className="text-xs text-ink-muted">
              {o.rent.length - rentUnpaid.length} of {o.rent.length} paid
            </span>
          </div>
          {o.rent.length ? (
            <ul className="mt-2 divide-y divide-line/60">
              {o.rent.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0 text-sm">
                    <span className="font-semibold text-ink">{r.business_name}</span>
                    <span className="ml-2 tabular-nums text-ink-muted">{formatMoney(r.rent_amount)}</span>
                  </span>
                  {r.payment ? (
                    <span className="flex items-center gap-2">
                      <Badge tone="success">paid {formatDateShort(r.payment.received_on)}</Badge>
                      <form action={rentUndo}>
                        <input type="hidden" name="month" value={month} />
                        <input type="hidden" name="directory_id" value={r.id} />
                        <button className="text-xs text-ink-muted underline hover:text-ink">undo</button>
                      </form>
                    </span>
                  ) : (
                    <form action={rentPaid} className="flex items-center gap-1.5">
                      <input type="hidden" name="month" value={month} />
                      <input type="hidden" name="directory_id" value={r.id} />
                      <input name="amount" inputMode="decimal" placeholder={String(r.rent_amount)} className="field !h-8 !w-24 !py-0 text-xs" aria-label="Amount received" />
                      <Button type="submit" size="sm" variant="accent">Mark paid</Button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-ink-muted">
              No rent set yet — add each tenant&apos;s monthly rent in <Link href="/admin/directory" className="underline">Directory</Link>.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}

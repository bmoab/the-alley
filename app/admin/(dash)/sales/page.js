import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth.js";
import {
  salesSummary,
  syncSquareSales,
  consignorShare,
  round2,
  unmatchedRefunds,
  uncreditedSales,
  markAlleys,
  guessVendor,
  creditSales,
  linkVariationsToVendor,
  listVendors,
} from "@/lib/inventory.js";
import { describeVariations } from "@/lib/square-retail.js";
import { getActor } from "@/lib/auth.js";
import Select from "@/components/admin/ui/Select.js";
import { isSquareConfigured } from "@/lib/square.js";
import { getSetting } from "@/lib/db.js";
import { venueDayOf, formatDateShort, formatMoney, shiftDate, venueToday, upperFirst } from "@/lib/constants.js";
import { fmtDay } from "@/lib/shift-format.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import Card from "@/components/admin/ui/Card.js";
import Button from "@/components/admin/ui/Button.js";

export const metadata = { title: "Sales" };
export const dynamic = "force-dynamic";

async function syncNow(formData) {
  "use server";
  await requireAdmin();
  const qs = (formData.get("qs") || "").toString();
  let msg;
  let type = "success";
  try {
    const r = await syncSquareSales();
    msg = r.simulated ? "Square isn't connected here — nothing to pull." : `Pulled ${r.added} new sale line${r.added === 1 ? "" : "s"} from Square.`;
  } catch (err) {
    msg = `Square sync failed: ${err.message}`;
    type = "error";
  }
  revalidatePath("/admin/sales");
  redirect(`/admin/sales?${qs}${qs ? "&" : ""}toast=${encodeURIComponent(msg)}&toastType=${type}`);
}

/** Credit each group of uncredited sales to the maker picked for it (blank = leave it The Alley's). */
async function creditAction(formData) {
  "use server";
  await requireAdmin();
  const { actorName } = await getActor();
  const qs = (formData.get("qs") || "").toString();
  // "Everything else is The Alley's": any row still on "Not sure yet" counts as The Alley's too.
  const rest = formData.get("rest") === "1";
  let lines = 0;
  let linked = 0;
  let alleys = 0;
  const makers = new Set();
  let msg;
  let type = "success";
  try {
    for (const key of formData.getAll("group")) {
      const pick = String(formData.get(`v_${key}`) || "");
      const ids = String(formData.get(`ids_${key}`) || "").split(",");
      if (pick === "alley" || (rest && !pick)) {
        alleys += markAlleys(ids, { by: actorName });
        continue;
      }
      const vendorId = Number(pick) || null;
      if (!vendorId) continue;
      const n = creditSales(ids, vendorId, { by: actorName });
      if (n) makers.add(vendorId);
      lines += n;
      const variation = formData.get(`future_${key}`);
      if (variation) linked += await linkVariationsToVendor(vendorId, [String(variation)]);
    }
    const parts = [];
    if (lines) parts.push(`Credited ${lines} sale${lines === 1 ? "" : "s"} to ${makers.size} maker${makers.size === 1 ? "" : "s"}.`);
    if (linked) parts.push(`${linked} item${linked === 1 ? " is" : "s are"} now theirs for future sales too.`);
    if (alleys) parts.push(`${alleys} sale${alleys === 1 ? "" : "s"} marked as The Alley's.`);
    msg = parts.length ? parts.join(" ") : "Nothing picked. Choose The Alley's or a maker next to a sale first.";
    if (!parts.length) type = "neutral";
  } catch (err) {
    msg = err.message;
    type = "error";
  }
  revalidatePath("/admin/sales");
  redirect(`/admin/sales?${qs}${qs ? "&" : ""}toast=${encodeURIComponent(msg)}&toastType=${type}#credit`);
}

async function unmarkAction(formData) {
  "use server";
  await requireAdmin();
  const qs = (formData.get("qs") || "").toString();
  const n = markAlleys(String(formData.get("ids") || "").split(","), { by: null });
  revalidatePath("/admin/sales");
  const msg = n ? "Back on the list to sort." : "That one can't be changed now.";
  redirect(`/admin/sales?${qs}${qs ? "&" : ""}toast=${encodeURIComponent(msg)}&toastType=${n ? "success" : "error"}#credit`);
}

async function uncreditAction(formData) {
  "use server";
  await requireAdmin();
  const qs = (formData.get("qs") || "").toString();
  const n = creditSales(String(formData.get("ids") || "").split(","), null);
  revalidatePath("/admin/sales");
  const msg = n ? "Taken back — it counts as The Alley's again." : "That one's already been paid out, so it can't be taken back.";
  redirect(`/admin/sales?${qs}${qs ? "&" : ""}toast=${encodeURIComponent(msg)}&toastType=${n ? "success" : "error"}#credit`);
}

/**
 * Uncredited sales in groups: every sale of the same Square item together (one
 * pick credits them all), each custom amount on its own.
 */
function groupUncredited(open, vendors) {
  const groups = new Map();
  for (const l of open) {
    const key = l.catalog_object_id ? `c${l.catalog_object_id.replace(/[^A-Za-z0-9]/g, "")}` : `l${l.id}`;
    const g = groups.get(key) || { key, name: l.catalog_object_id ? l.name : "Custom amount", catalogId: l.catalog_object_id, lines: [] };
    g.lines.push(l);
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => ({
    ...g,
    net: round2(g.lines.reduce((t, l) => t + Number(l.net), 0)),
    first: g.lines[g.lines.length - 1].sold_at,
    last: g.lines[0].sold_at,
    suggest: g.catalogId ? guessVendor(g.name, vendors) : null,
  }));
}

/** Calendar ranges for the preset chips. Quarters are calendar quarters (Utah's filing periods). */
function ranges(today) {
  const [y, m] = today.split("-").map(Number);
  const pad = (n) => String(n).padStart(2, "0");
  const monthStart = `${y}-${pad(m)}-01`;
  const lastMonthStart = shiftDate(monthStart, { months: -1 });
  const q = Math.floor((m - 1) / 3);
  const qStart = `${y}-${pad(q * 3 + 1)}-01`;
  const lastQStart = shiftDate(qStart, { months: -3 });
  return {
    month: { label: "This month", from: monthStart, to: shiftDate(shiftDate(monthStart, { months: 1 }), { days: -1 }) },
    lastMonth: { label: "Last month", from: lastMonthStart, to: shiftDate(monthStart, { days: -1 }) },
    quarter: { label: "This quarter", from: qStart, to: shiftDate(shiftDate(qStart, { months: 3 }), { days: -1 }) },
    lastQuarter: { label: "Last quarter", from: lastQStart, to: shiftDate(qStart, { days: -1 }) },
    year: { label: "This year", from: `${y}-01-01`, to: `${y}-12-31` },
    lastYear: { label: "Last year", from: `${y - 1}-01-01`, to: `${y - 1}-12-31` },
  };
}

function Row({ label, value, strong, hint }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/60 py-1.5 text-sm last:border-0">
      <span className={strong ? "font-semibold text-ink" : "text-ink-soft"}>
        {label}
        {hint ? <span className="block text-xs font-normal text-ink-muted">{hint}</span> : null}
      </span>
      <span className={`tabular-nums ${strong ? "font-semibold text-ink" : "text-ink"}`}>{formatMoney(value)}</span>
    </div>
  );
}

export default async function SalesPage({ searchParams }) {
  await requireAdmin();
  const today = venueToday();
  const presets = ranges(today);
  const presetKey = presets[searchParams?.p] ? searchParams.p : searchParams?.from ? null : "month";
  const from = presetKey ? presets[presetKey].from : searchParams.from;
  const to = presetKey ? presets[presetKey].to : searchParams.to || today;
  const s = salesSummary(from, to);
  const lastRun = getSetting("square_sales_last_run", "");

  // Sales tax covers the shop and The Alley's own ticket sales (admissions are
  // taxable). Renting a whole room for an event isn't — the renter gets the sole
  // use of the place, which R865-19S-33(4) says is a rental, not an admission —
  // and deposits are refundable, so neither belongs on the return.
  const sales = s.lines.filter((l) => l.kind === "retail" || l.kind === "ticket");
  const untaxedTickets = s.lines.filter((l) => l.kind === "ticket" && Number(l.tax) === 0 && Number(l.net) !== 0);
  const taxableNet = round2(sales.filter((l) => Number(l.tax) !== 0).reduce((t, l) => t + Number(l.net), 0));
  const untaxedNet = round2(sales.filter((l) => Number(l.tax) === 0).reduce((t, l) => t + Number(l.net), 0));
  // Every cent of tax Square collected gets paid over — even on a line that
  // shouldn't have been taxed — so this counts all of it, not just the shop's.
  const taxCollected = round2(s.lines.reduce((t, l) => t + Number(l.tax), 0));
  const taxedRentals = s.lines.filter((l) => (l.kind === "rental" || l.kind === "deposit") && Number(l.tax) !== 0);
  const giftCards = s.lines.filter((l) => l.kind === "giftcard");
  const loose = unmatchedRefunds(from, to);
  const qs = presetKey ? `p=${presetKey}` : `from=${from}&to=${to}`;
  const makers = listVendors({ includeInactive: true }).filter((v) => !/^test$/i.test(v.name));
  const unc = uncreditedSales(from, to);
  const groups = groupUncredited(unc.open, makers);
  // Which of those items are still in Square (so their future sales can be theirs too).
  // null = couldn't ask Square (not connected here, or it failed) — then don't claim anything's gone.
  let inSquare = null;
  if (isSquareConfigured()) {
    try {
      inSquare = await describeVariations(groups.filter((g) => g.catalogId).map((g) => g.catalogId));
    } catch {
      inSquare = null;
    }
  }

  return (
    <div>
      <PageHeader
        title="Sales"
        subtitle="What sold at the register (and the room rentals paid through Square), pulled from Square every night. Makers' shares and the sales-tax numbers come from here."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {Object.entries(presets).map(([k, r]) => (
          <Button key={k} href={`/admin/sales?p=${k}`} variant={k === presetKey ? "primary" : "ghost"} size="sm">
            {r.label}
          </Button>
        ))}
        <form className="flex w-full items-center gap-2 sm:w-auto">
          <input name="from" type="date" defaultValue={from} aria-label="From" className="field min-w-0 flex-1 text-sm sm:w-40 sm:flex-none" />
          <span className="shrink-0 text-xs text-ink-muted">to</span>
          <input name="to" type="date" defaultValue={to} aria-label="To" className="field min-w-0 flex-1 text-sm sm:w-40 sm:flex-none" />
          <Button type="submit" variant="ghost" className="!h-11 shrink-0">Go</Button>
        </form>
      </div>
      <div className="mb-6 flex flex-wrap items-center gap-3 text-xs text-ink-muted">
        <span>
          {formatDateShort(from)} – {formatDateShort(to)} · Last pulled from Square{" "}
          {lastRun ? new Date(lastRun).toLocaleString("en-US", { timeZone: "America/Denver", dateStyle: "medium", timeStyle: "short" }) : "never"}
        </span>
        <form action={syncNow}>
          <input type="hidden" name="qs" value={qs} />
          <Button type="submit" variant="ghost" size="sm" disabled={!isSquareConfigured()}>Pull now</Button>
        </form>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card pad="md">
          <h2 className="text-base font-semibold text-ink">Shop sales</h2>
          <Row label="Sold (before discounts)" value={s.retail.gross} />
          <Row label="Discounts" value={-s.retail.discount} />
          <Row label="Net retail sales" value={s.retail.net} strong />
          <Row label="— makers' items" value={s.consigned.net} hint={`${formatMoney(s.consignorShare)} of it is owed to makers`} />
          <Row
            label="— The Alley's own"
            value={s.owned.net}
            hint={`things bought outright and added in Square${s.custom.count ? ` · ${formatMoney(s.custom.net)} rung up as custom amounts` : ""}`}
          />
          <Row label="The Alley keeps from retail" value={round2(s.retail.net - s.consignorShare)} strong hint="net retail minus makers' shares" />
          {s.tickets.count ? <Row label="Event tickets (The Alley's own events)" value={s.tickets.net} hint={`${formatMoney(s.tickets.tax)} sales tax collected on them`} /> : null}
        </Card>

        <Card pad="md">
          <h2 className="text-base font-semibold text-ink">For the Utah sales-tax return (TC-62)</h2>
          <Row label="Shop + ticket sales" value={round2(taxableNet + untaxedNet)} strong hint="after discounts, before tax" />
          <Row label="Taxed" value={taxableNet} />
          <Row label="Rung up with no tax" value={untaxedNet} hint="check each of these really is exempt" />
          <Row label="Sales tax collected" value={taxCollected} strong />
          {taxedRentals.length ? (
            <p className="mt-2 rounded-lg border border-rust/30 bg-rust/10 p-2 text-xs text-rust">
              {taxedRentals.length} room rental or deposit line{taxedRentals.length === 1 ? " was" : "s were"} rung up WITH tax (
              {formatMoney(round2(taxedRentals.reduce((t, l) => t + Number(l.tax), 0)))}). Rentals aren&apos;t taxable, but tax
              collected still has to be paid over — it&apos;s included above. Check how it was rung up.
            </p>
          ) : null}
          {untaxedTickets.length ? (
            <p className="mt-2 rounded-lg border border-rust/30 bg-rust/10 p-2 text-xs text-rust">
              {untaxedTickets.length} ticket sale{untaxedTickets.length === 1 ? " was" : "s were"} rung up with no tax. Admission
              The Alley sells is taxable — check the ticket item&apos;s tax in Square.
            </p>
          ) : null}
          <div className="mt-3 rounded-lg bg-paper-dim p-3 text-xs text-ink-muted">
            <p>
              <strong className="text-ink-soft">Not on the return:</strong> room rentals ({formatMoney(s.rental.net)}),
              refundable deposits ({formatMoney(s.deposit.net)} after any refunded)
              {giftCards.length ? <> and gift cards sold ({formatMoney(round2(giftCards.reduce((t, l) => t + Number(l.net), 0)))} — taxed when they&apos;re spent)</> : null}.
            </p>
            <p className="mt-1">
              A booking gives the renter the whole room for their event, which Utah treats as a rental of the place, not a
              taxable sale or admission (Utah Admin. Code R865-19S-33(4)). Tickets The Alley sells to its own events are
              taxable and counted above; so would be food or drinks, or tables, chairs or equipment rented separately.
            </p>
          </div>
        </Card>
      </div>

      {loose.length ? (
        <Card pad="md" className="mt-6 border-rust/40">
          <h2 className="text-base font-semibold text-ink">
            Refunds given back as an amount{" "}
            <span className="font-normal text-ink-muted">· {formatMoney(round2(loose.reduce((t, r) => t + Number(r.amount), 0)))}</span>
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            These were refunded as a dollar amount instead of item by item, so they aren&apos;t taken off the numbers above or off
            a maker&apos;s share. Take them off by hand when filing, and settle any maker item with the maker. At the register,
            refund makers&apos; items <strong>item by item</strong> and this stays empty.
          </p>
          <ul className="mt-3 divide-y divide-line text-sm">
            {loose.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span className="text-ink">
                  {fmtDay(venueDayOf(r.created_at))}
                  <span className="text-ink-muted">
                    {" "}
                    · {r.lines.length ? r.lines.map((l) => `${l.name}${l.vendor_name ? ` (${l.vendor_name})` : ""}`).join(", ") : "order not in the synced sales"}
                    {r.reason ? ` · “${r.reason}”` : ""}
                  </span>
                </span>
                <span className="font-semibold tabular-nums text-rust">−{formatMoney(r.amount)}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {groups.length || unc.credited.length || unc.alleys.length ? (
        <CreditCard groups={groups} credited={unc.credited} alleys={unc.alleys} makers={makers} inSquare={inSquare} qs={qs} />
      ) : null}

      <Card pad="md" className="mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-ink">Every line</h2>
          <span className="text-xs text-ink-muted">
            Spreadsheet for the year:{" "}
            <a href={`/api/admin/shop-export?what=sales&year=${from.slice(0, 4)}`} className="font-semibold underline">sales</a> ·{" "}
            <a href={`/api/admin/shop-export?what=payouts&year=${from.slice(0, 4)}`} className="font-semibold underline">maker payouts</a>
          </span>
        </div>
        {s.lines.length ? (
          <ul className="mt-2 divide-y divide-line/60 text-sm sm:hidden">
            {s.lines.map((l) => (
              <li key={l.id} className="py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 text-ink">
                    {l.name}
                    {l.is_return ? <span className="ml-1 text-xs text-rust">(return)</span> : null}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-ink">{formatMoney(l.net)}</span>
                </div>
                <div className="mt-0.5 text-xs text-ink-muted">
                  {fmtDay(l.sold_at.slice(0, 10))} · <Whose l={l} inline />
                  {Number(l.qty) !== 1 ? ` · ${l.qty} of them` : ""} · tax {formatMoney(l.tax)}
                  {l.ownership === "consignment" ? ` · maker's share ${formatMoney(consignorShare(l))}` : ""}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        {s.lines.length ? (
          <div className="-mx-1 mt-2 hidden overflow-x-auto px-1 sm:block">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-muted">
                  <th className="py-1.5 pr-2">When</th>
                  <th className="py-1.5 pr-2">What</th>
                  <th className="py-1.5 pr-2">Whose</th>
                  <th className="py-1.5 pr-2 text-right">Qty</th>
                  <th className="py-1.5 pr-2 text-right">Net</th>
                  <th className="py-1.5 pr-2 text-right">Tax</th>
                  <th className="py-1.5 text-right">Maker&apos;s share</th>
                </tr>
              </thead>
              <tbody>
                {s.lines.map((l) => (
                  <tr key={l.id} className="border-b border-line/60">
                    <td className="py-1.5 pr-2 whitespace-nowrap text-ink-soft">{fmtDay(l.sold_at.slice(0, 10))}</td>
                    <td className="py-1.5 pr-2 text-ink">
                      {l.name}
                      {l.is_return ? <span className="ml-1 text-xs text-rust">(return)</span> : null}
                    </td>
                    <td className="py-1.5 pr-2 text-ink-soft">
                      <Whose l={l} />
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{l.qty}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{formatMoney(l.net)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{formatMoney(l.tax)}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {l.ownership === "consignment" ? formatMoney(consignorShare(l)) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-sm text-ink-muted">No sales in this range.</p>
        )}
      </Card>
    </div>
  );
}

/** Whose a sale line is: a maker (linked), The Alley, or what kind of payment. */
function Whose({ l, inline = false }) {
  if (l.kind !== "retail") return ({ staffshare: "Tenant's staff share", utilityshare: "Utility share", rent: "Rent" })[l.kind] || upperFirst(l.kind);
  if (l.vendor_id) {
    return (
      <>
        <Link href={`/admin/vendors/${l.vendor_id}`} className="hover:underline">
          {l.vendor_name}
        </Link>
        {!l.item_id ? <span className={inline ? "" : "block text-xs text-ink-muted"}>{inline ? " (credited by hand)" : "credited by hand"}</span> : null}
      </>
    );
  }
  return l.catalog_object_id ? "The Alley" : "custom amount";
}

/**
 * Sales the register didn't tie to a maker, to credit by hand: a custom amount,
 * or an item rung up before it was linked here (or since deleted from Square).
 */
// The Alley's own stock is named "The Alley- …" / "Alley- …" in Square.
const OWN = /^\s*(the\s+)?alley\b/i;

function CreditCard({ groups, credited, alleys, makers, inSquare, qs }) {
  const total = round2(groups.reduce((t, g) => t + g.net, 0));
  const likely = groups.filter((g) => !OWN.test(g.name));
  const own = groups.filter((g) => OWN.test(g.name));
  const row = (g) => {
    const live = g.catalogId && inSquare?.[g.catalogId];
    const gone = g.catalogId && inSquare && !inSquare[g.catalogId];
    const options = g.suggest ? [g.suggest, ...makers.filter((m) => m.id !== g.suggest.id)] : makers;
    return (
      <li key={g.key} className="grid grid-cols-1 gap-2 py-2.5 sm:grid-cols-[1fr_auto] sm:items-center">
        <input type="hidden" name="group" value={g.key} />
        <input type="hidden" name={`ids_${g.key}`} value={g.lines.map((l) => l.id).join(",")} />
        <div className="min-w-0 text-sm">
          <p className="font-medium text-ink">
            {g.name}
            {g.lines.some((l) => l.is_return) ? <span className="ml-1 text-xs text-rust">(includes a return)</span> : null}
          </p>
          <p className="text-xs text-ink-muted">
            {g.lines.length > 1 ? `${g.lines.length} sales · ` : ""}
            {fmtDay(g.first.slice(0, 10))}
            {g.lines.length > 1 && g.first.slice(0, 10) !== g.last.slice(0, 10) ? ` – ${fmtDay(g.last.slice(0, 10))}` : ""} ·{" "}
            <span className="font-semibold text-ink">{formatMoney(g.net)}</span>
            {g.suggest ? <span className="text-verde-deep"> · looks like {g.suggest.name}</span> : null}
            {gone ? " · no longer in Square" : ""}
          </p>
        </div>
        <div className="flex flex-col gap-1 sm:w-64">
          <Select name={`v_${g.key}`} defaultValue={OWN.test(g.name) ? "alley" : ""} aria-label={`Whose was ${g.name}?`}>
            <option value="">Not sure yet</option>
            <option value="alley">The Alley&apos;s</option>
            {options.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {g.suggest?.id === m.id ? " (looks like it)" : ""}
              </option>
            ))}
          </Select>
          {live ? (
            <label className="flex items-center gap-1.5 text-xs text-ink-soft">
              <input type="checkbox" name={`future_${g.key}`} value={g.catalogId} defaultChecked />
              Future sales of this item too
            </label>
          ) : null}
        </div>
      </li>
    );
  };
  return (
    <Card pad="md" className="mt-6" id="credit">
      <h2 className="text-base font-semibold text-ink">
        Not credited to a maker{" "}
        {groups.length ? <span className="font-normal text-ink-muted">· {formatMoney(total)} in these dates</span> : null}
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        These were rung up as a custom amount, or as an item this site doesn&apos;t know as a maker&apos;s. Until you sort them they
        count as The Alley&apos;s. If one was a maker&apos;s, pick them: the sale moves to their side, at their split, and shows in
        what they&apos;re owed. If it&apos;s The Alley&apos;s, pick The Alley&apos;s and it leaves this list. Don&apos;t credit anything
        you&apos;ve already paid a maker for by hand.
      </p>

      {groups.length ? (
        <form action={creditAction} className="mt-3">
          <input type="hidden" name="qs" value={qs} />
          {likely.length ? <ul className="divide-y divide-line">{likely.map(row)}</ul> : null}
          {own.length ? (
            <details className="mt-2 rounded-lg border border-line px-3 py-1">
              <summary className="cursor-pointer py-1.5 text-sm text-ink-soft">
                The Alley&apos;s own items ({own.length}) · {formatMoney(round2(own.reduce((t, g) => t + g.net, 0)))} — open only if one
                was really a maker&apos;s
              </summary>
              <ul className="divide-y divide-line">{own.map(row)}</ul>
            </details>
          ) : null}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button type="submit">Save</Button>
            <Button type="submit" name="rest" value="1" variant="ghost">
              Save, and everything on &ldquo;Not sure yet&rdquo; is The Alley&apos;s
            </Button>
          </div>
        </form>
      ) : (
        <p className="mt-3 text-sm text-ink-muted">All sorted for these dates.</p>
      )}

      {alleys.length ? (
        <details className="mt-5">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Marked as The Alley&apos;s ({alleys.length}) · {formatMoney(round2(alleys.reduce((t, l) => t + Number(l.net), 0)))}
          </summary>
          <ul className="mt-1 divide-y divide-line text-sm">
            {alleys.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <span className="min-w-0 text-ink">
                  {fmtDay(l.sold_at.slice(0, 10))} · {l.catalog_object_id ? l.name : "Custom amount"} ·{" "}
                  <span className="font-semibold">{formatMoney(l.net)}</span>
                  {l.alley_confirmed_by ? <span className="text-xs text-ink-muted"> · by {l.alley_confirmed_by}</span> : null}
                </span>
                <form action={unmarkAction}>
                  <input type="hidden" name="qs" value={qs} />
                  <input type="hidden" name="ids" value={l.id} />
                  <button type="submit" className="text-xs font-semibold text-rust hover:underline">
                    Undo
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {credited.length ? (
        <div className="mt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Credited by hand, not paid out yet</h3>
          <ul className="mt-1 divide-y divide-line text-sm">
            {credited.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <span className="min-w-0 text-ink">
                  {fmtDay(l.sold_at.slice(0, 10))} · {l.name}
                  {l.is_return ? <span className="ml-1 text-xs text-rust">(return)</span> : null} ·{" "}
                  <span className="font-semibold">{formatMoney(l.net)}</span> →{" "}
                  <Link href={`/admin/vendors/${l.assigned_vendor_id}`} className="font-medium text-verde-deep hover:underline">
                    {l.assigned_name}
                  </Link>
                  {l.assigned_by ? <span className="text-xs text-ink-muted"> · by {l.assigned_by}</span> : null}
                </span>
                <form action={uncreditAction}>
                  <input type="hidden" name="qs" value={qs} />
                  <input type="hidden" name="ids" value={l.id} />
                  <button type="submit" className="text-xs font-semibold text-rust hover:underline">
                    Take back
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

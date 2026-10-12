import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth.js";
import { salesSummary, syncSquareSales, consignorShare, round2, unmatchedRefunds } from "@/lib/inventory.js";
import { isSquareConfigured } from "@/lib/square.js";
import { getSetting } from "@/lib/db.js";
import { formatDateShort, formatMoney, shiftDate, venueToday } from "@/lib/constants.js";
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
        <form className="flex flex-wrap items-center gap-1">
          <input name="from" type="date" defaultValue={from} className="field !h-8 !w-auto !py-0 text-xs" />
          <span className="text-xs text-ink-muted">to</span>
          <input name="to" type="date" defaultValue={to} className="field !h-8 !w-auto !py-0 text-xs" />
          <Button type="submit" variant="ghost" size="sm">Go</Button>
        </form>
      </div>
      <div className="mb-6 flex flex-wrap items-center gap-3 text-xs text-ink-muted">
        <span>
          {formatDateShort(from)} – {formatDateShort(to)} · last pulled from Square{" "}
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
              refundable deposits ({formatMoney(s.deposit.net)})
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
                  {fmtDay(r.created_at.slice(0, 10))}
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
          <div className="-mx-1 mt-2 overflow-x-auto px-1">
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
                      {l.kind !== "retail" ? (
                        l.kind
                      ) : l.vendor_id ? (
                        <Link href={`/admin/vendors/${l.vendor_id}`} className="hover:underline">
                          {l.vendor_name}
                        </Link>
                      ) : l.catalog_object_id ? (
                        "The Alley"
                      ) : (
                        "custom amount"
                      )}
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

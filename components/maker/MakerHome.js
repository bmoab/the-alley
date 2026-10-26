import {
  makerOverview,
  makerInsights,
  makerGroups,
  suggestedGroups,
  shortName,
  artistForVendor,
  agreedSplit,
  termsFor,
  needsTerms,
} from "@/lib/inventory.js";
import { venueDayOf, formatDate, formatDateShort, formatMoney, venueToday } from "@/lib/constants.js";
import { agreeToTerms, withdrawDropoff, saveMakerDetails, saveItems, sortItemsByName, confirmSheet } from "@/app/maker/actions.js";
import { vendorHistory, listAgreements, intakesToConfirm } from "@/lib/vendor-record.js";
import { getIntake } from "@/lib/inventory.js";
import { formatPayout } from "@/lib/payout.js";
import PayoutMethodField from "@/components/maker/PayoutMethodField.js";
import VendorHistory from "@/components/maker/VendorHistory.js";
import DropoffForm from "@/components/maker/DropoffForm.js";
import SalesInsights from "@/components/maker/SalesInsights.js";
import ItemSetup from "@/components/maker/ItemSetup.js";
import Card from "@/components/admin/ui/Card.js";
import Badge from "@/components/admin/ui/Badge.js";
import Button from "@/components/admin/ui/Button.js";

const DROPOFF_STATUS = {
  submitted: { tone: "warning", label: "waiting to come in" },
  accepted: { tone: "success", label: "received" },
  declined: { tone: "danger", label: "not accepted" },
  cancelled: { tone: "neutral", label: "cancelled" },
};

function Stat({ label, value, hint }) {
  return (
    <div className="card ac-figure" style={{ padding: "18px 20px" }}>
      <b className="tabular-nums">{value}</b>
      <span>{label}</span>
      {hint ? <p className="ac-small" style={{ margin: "4px 0 0" }}>{hint}</p> : null}
    </div>
  );
}

function SalesTable({ lines }) {
  if (!lines.length) return <p className="mt-2 text-sm text-ink-muted">Nothing yet.</p>;
  return (
    <div className="-mx-1 mt-2 overflow-x-auto px-1">
      <table className="w-full min-w-[420px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-muted">
            <th className="py-1.5 pr-2">Day</th>
            <th className="py-1.5 pr-2">Item</th>
            <th className="py-1.5 pr-2 text-right">Qty</th>
            <th className="py-1.5 pr-2 text-right">Sold for</th>
            <th className="py-1.5 text-right">Yours</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-b border-line/60">
              <td className="py-1.5 pr-2 whitespace-nowrap text-ink-soft">{formatDateShort(l.sold_at.slice(0, 10))}</td>
              <td className="py-1.5 pr-2 text-ink">
                {l.name}
                {l.is_return ? <span className="ml-1 text-xs text-rust">(returned)</span> : null}
              </td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{l.qty}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{formatMoney(l.net)}</td>
              <td className="py-1.5 text-right font-semibold tabular-nums">{formatMoney(l.share)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A maker's whole view: terms, drop-offs, what's on the shelf, what sold and
 * what they've been paid. Shared by their account (/account/consign/[id]) and
 * their private link (/maker/[token]); `hidden` tells the actions which.
 * `preview` is the team looking at it (Makers → See their page): the same
 * page, minus their private costs.
 */
export default function MakerHome({ vendorId, hidden, notice = null, preview = false }) {
  const o = makerOverview(vendorId);
  const raw = makerInsights(vendorId);
  const insights = preview ? { ...raw, items: raw.items.map((i) => ({ ...i, cost: null })) } : raw;
  const showCost = !preview;
  const toConfirm = intakesToConfirm(vendorId);
  const history = vendorHistory(vendorId);
  const sheets = Object.fromEntries(
    history.filter((r) => r.kind === "received" && r.intakeId).map((r) => [r.intakeId, getIntake(r.intakeId)?.lines || []])
  );
  const groups = makerGroups(vendorId);
  const v = o.vendor;
  // A gallery artist sells through the same consignment; only the words change.
  const artist = !!artistForVendor(v);
  const shelfWord = artist ? "In the gallery" : "On the shelf";
  // Their items, a group at a time (ungrouped last), for the shelf and the setup form.
  const shelf = [...o.items].sort(
    (a, b) => (a.item_group ? 0 : 1) - (b.item_group ? 0 : 1) || (a.item_group || "").localeCompare(b.item_group || "") || a.name.localeCompare(b.name)
  );
  const grouped = shelf.some((i) => i.item_group);
  const soldEver = new Set(Object.keys(insights.periods.find((p) => p.key === "all").byItem).map(Number));
  const setupItems = insights.items.filter((i) => i.active || soldEver.has(i.id));
  const terms = termsFor(v);
  const mustAgree = needsTerms(v);
  // Agreed before, and their share has moved since: say so plainly.
  const wasSplit = mustAgree ? agreedSplit(v) : null;
  const shareChanged = wasSplit != null && wasSplit !== o.split;
  const monthName = new Date(o.dueThrough + "T12:00:00").toLocaleDateString("en-US", { month: "long" });
  const thisYear = venueToday().slice(0, 4);
  const sum = (lines, k) => lines.reduce((t, l) => t + Number(l[k] || 0), 0);
  const hiddenFields = Object.entries(hidden).map(([k, val]) => <input key={k} type="hidden" name={k} value={val} />);

  return (
    <div className="ac-maker space-y-6">
      <header className="ac-hello" style={{ marginBottom: 8 }}>
        <p className="ac-eyebrow ac-date ac-rise">{artist ? "Art sales" : "Consignment"}</p>
        <h1 className="ac-title ac-rise ac-rise-1">{v.name}</h1>
        <p className="ac-lede ac-rise ac-rise-2">
          You get {o.split}% of every sale, paid monthly for the month before.
          {o.lastSynced
            ? ` Sales updated ${new Date(o.lastSynced).toLocaleString("en-US", { timeZone: "America/Denver", dateStyle: "medium", timeStyle: "short" })}.`
            : ""}
        </p>
      </header>
      {notice}

      {mustAgree ? (
        <Card pad="lg" id="terms" className="border-verde-deep/50">
          <h2 className="ac-h2">
            {shareChanged
              ? "Your share has changed"
              : v.terms_accepted_at
                ? "Our consignment terms have changed"
                : "First, our consignment terms"}
          </h2>
          {shareChanged ? (
            <p className="mt-2 text-sm text-ink">
              You now get <strong>{o.split}%</strong> of each sale (it was {wasSplit}%). That&apos;s for sales from the change on;
              anything sold before stays at {wasSplit}%. Read the updated terms below and agree to keep listing drop-offs.
            </p>
          ) : v.terms_accepted_at ? (
            <p className="mt-2 text-sm text-ink">
              We&apos;ve updated the terms since you agreed. Read them below and agree to keep listing drop-offs.
            </p>
          ) : null}
          <div className="mt-2 max-h-80 overflow-y-auto whitespace-pre-line rounded-lg bg-paper-dim p-3 text-sm text-ink-soft">
            {terms.text}
          </div>
          <form action={agreeToTerms} className="mt-3 flex flex-wrap items-end gap-2">
            {hiddenFields}
            <div className="min-w-[14rem] flex-1">
              <label className="label">Type your full name to agree</label>
              <input name="signed_name" required className="field" autoComplete="name" />
            </div>
            <Button type="submit">I agree</Button>
          </form>
        </Card>
      ) : null}

      {toConfirm.map((sheet) => {
        const units = sheet.lines.reduce((t, l) => t + l.qty, 0);
        return (
          <Card key={sheet.id} pad="lg" id={`sheet-${sheet.id}`} className="border-verde-deep/50">
            <h2 className="ac-h2">Check what we counted in on {formatDate(sheet.received_on)}</h2>
            <p className="mt-1 text-sm text-ink-soft">
              {units} item{units === 1 ? "" : "s"}, counted in by {sheet.received_by}. If it matches what you brought, confirm it
              below. Something off? Reply to any of our emails or write to thealleyoncenter@gmail.com and we&apos;ll fix it.
            </p>
            <div className="-mx-1 mt-3 overflow-x-auto px-1">
              <table className="w-full min-w-[320px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-muted">
                    <th className="py-1.5 pr-2">Item</th>
                    <th className="py-1.5 pr-2 text-right">Qty</th>
                    <th className="py-1.5 text-right">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {sheet.lines.map((l) => (
                    <tr key={l.id} className="border-b border-line/60">
                      <td className="py-1.5 pr-2 text-ink">{l.name}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{l.qty}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatMoney(l.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <form action={confirmSheet} className="mt-3 flex flex-wrap items-end gap-2">
              {hiddenFields}
              <input type="hidden" name="intake" value={sheet.id} />
              <div className="min-w-[14rem] flex-1">
                <label className="label">Type your name to confirm</label>
                <input name="confirmed_name" required className="field" autoComplete="name" defaultValue="" />
              </div>
              <Button type="submit">These are right</Button>
            </form>
          </Card>
        );
      })}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label={shelfWord}
          value={o.onShelf}
          hint={artist ? `${o.items.length} piece${o.items.length === 1 ? "" : "s"}` : `${o.items.length} product${o.items.length === 1 ? "" : "s"}`}
        />
        <Stat label="This month so far" value={formatMoney(o.soFarThisMonth)} hint="your share" />
        <Stat label={`${monthName} payout`} value={formatMoney(o.due)} hint={o.due ? "coming your way" : "nothing owed"} />
        <Stat
          label="Paid this year"
          value={formatMoney(o.payouts.filter((p) => p.paid_on.slice(0, 4) === thisYear).reduce((t, p) => t + p.amount, 0))}
        />
      </div>

      <Card pad="lg" id="selling">
        <h2 className="ac-h2">How it&apos;s selling</h2>
        <SalesInsights items={insights.items} periods={insights.periods} months={insights.months} whose="your" showCost={showCost} />
      </Card>

      <Card pad="lg" id="dropoffs">
        <h2 className="ac-h2">Bringing something in?</h2>
        <p className="mt-1 text-sm text-ink-soft">
          List it here first. When you come in we count it together, put it in the register and print the price tags.
        </p>
        <div className="mt-4">
          {mustAgree ? (
            <p className="text-sm text-ink-muted">Agree to the terms above first.</p>
          ) : (
            // Keyed on the list so a sent drop-off clears the form.
            <DropoffForm
              key={o.dropoffs.length}
              items={shelf.map((i) => ({ id: i.id, name: i.name, price: i.price, group: i.item_group }))}
              groups={groups}
              hidden={hidden}
              placeholder={artist ? "e.g. Bear River at dusk, oil, 16 × 20" : undefined}
              groupPlaceholder={artist ? "e.g. Originals, or Prints" : undefined}
            />
          )}
        </div>
        {o.dropoffs.length ? (
          <ul className="mt-5 divide-y divide-line border-t border-line text-sm">
            {o.dropoffs.map((d) => {
              const st = DROPOFF_STATUS[d.status] || DROPOFF_STATUS.cancelled;
              return (
                <li key={d.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="font-semibold text-ink">{formatDateShort(venueDayOf(d.created_at))}</span>
                  <span className="text-ink-muted">
                    {d.units} item{d.units === 1 ? "" : "s"} · {formatMoney(d.value)}
                  </span>
                  <Badge tone={st.tone}>{st.label}</Badge>
                  {d.status === "declined" && d.decline_reason ? <span className="text-xs text-ink-muted">{d.decline_reason}</span> : null}
                  {d.status === "submitted" ? (
                    <form action={withdrawDropoff} className="ml-auto">
                      {hiddenFields}
                      <input type="hidden" name="id" value={d.id} />
                      <button className="text-xs font-semibold text-rust hover:underline">Cancel</button>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </Card>

      <Card pad="lg">
        <h2 className="ac-h2">{shelfWord}</h2>
        {o.items.length ? (
          <div className="-mx-1 mt-2 overflow-x-auto px-1">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-muted">
                  <th className="py-1.5 pr-2">Item</th>
                  <th className="py-1.5 pr-2 text-right">Price</th>
                  <th className="py-1.5 pr-2 text-right">Left</th>
                  <th className="py-1.5 pr-2 text-right">Sold</th>
                  <th className="py-1.5 text-right">Since</th>
                </tr>
              </thead>
              <tbody>
                {shelf.map((i, idx) => [
                  grouped && (idx === 0 || shelf[idx - 1].item_group !== i.item_group) ? (
                    <tr key={`g-${i.item_group || ""}`}>
                      <td colSpan={5} className="pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">
                        {i.item_group || "Not in a group"}
                      </td>
                    </tr>
                  ) : null,
                  <tr key={i.id} className="border-b border-line/60">
                    <td className="py-1.5 pr-2 text-ink">
                      <span className="inline-flex items-center gap-2">
                        {i.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={i.photo} alt="" className="h-8 w-8 shrink-0 object-cover" />
                        ) : null}
                        {shortName(i.name, i.item_group)}
                      </span>
                      {i.daysOnShelf != null && i.daysOnShelf > o.pickupDays && i.qty_on_hand > 0 ? (
                        <span className="ml-1 text-xs text-rust">time to swap out</span>
                      ) : null}
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{formatMoney(i.price)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{i.qty_on_hand}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{i.sold}</td>
                    <td className="py-1.5 text-right whitespace-nowrap text-ink-soft">
                      {i.first_received ? formatDateShort(i.first_received) : "—"}
                    </td>
                  </tr>,
                ])}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-sm text-ink-muted">Nothing yet — list your first drop-off above.</p>
        )}
        {setupItems.length ? (
          <details id="setup" className="mt-5 border-t border-line pt-4">
            <summary className="text-sm font-semibold text-ink">Photos, groups and your costs (all optional)</summary>
            <p className="mt-2 text-sm text-ink-soft">
              Add a photo of each piece if you like. Groups put things together in How it&apos;s selling: say Large Candle, with
              each scent inside it. Add what a piece costs you to make and you&apos;ll see your profit too.
            </p>
            <div className="mt-3">
              <ItemSetup
                // A fresh form whenever what's saved changes (sorting, saving).
                key={setupItems.map((i) => `${i.id}:${i.group}:${i.cost}:${i.photo}`).join("|")}
                items={setupItems}
                suggestions={suggestedGroups(vendorId)}
                hidden={hidden}
                action={saveItems}
                groupAction={sortItemsByName}
                showCost={showCost}
              />
            </div>
          </details>
        ) : null}
      </Card>

      <Card pad="lg">
        <h2 className="ac-h2">
          Sold this month <span className="font-normal text-ink-muted">· {formatMoney(sum(o.salesThisMonth, "share"))} yours</span>
        </h2>
        <SalesTable lines={o.salesThisMonth} />
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold text-ink-muted">
            Last month · {formatMoney(sum(o.salesLastMonth, "share"))} yours
          </summary>
          <SalesTable lines={o.salesLastMonth} />
        </details>
      </Card>

      <Card pad="lg">
        <h2 className="ac-h2">Payouts</h2>
        {o.payouts.length ? (
          <ul className="mt-2 divide-y divide-line text-sm">
            {o.payouts.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span className="text-ink">
                  {formatDate(p.paid_on)}
                  <span className="text-ink-muted"> · sales through {formatDateShort(p.through)}{p.method ? ` · ${formatPayout(p.method)}` : ""}</span>
                </span>
                <span className="font-semibold tabular-nums text-ink">{formatMoney(p.amount)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-ink-muted">No payouts yet.</p>
        )}
      </Card>

      <Card pad="lg" id="details">
        <h2 className="ac-h2">Your details</h2>
        <form action={saveMakerDetails} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {hiddenFields}
          <div>
            <label className="label">Your name</label>
            <input name="contact_name" defaultValue={v.contact_name || ""} className="field" />
          </div>
          <div>
            <label className="label">Phone</label>
            <input name="phone" type="tel" defaultValue={v.phone || ""} className="field" />
          </div>
          <div className="sm:col-span-2">
            <PayoutMethodField defaultValue={v.payout_method || ""} id="my-pay" />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" variant="ghost">Save</Button>
            <p className="mt-2 text-xs text-ink-muted">
              To change your email ({v.email || "none on file"}) or your share, ask us.
              {v.terms_accepted_at ? ` You agreed to the terms on ${formatDateShort(venueDayOf(v.terms_accepted_at))}.` : ""}
            </p>
          </div>
        </form>
      </Card>

      <Card pad="lg" id="record">
        <h2 className="ac-h2">Your record with us</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Everything between you and The Alley: each time you agreed to the terms (open one to read the exact words), what
          we counted in, payouts, and any change to your terms or share. We see the same list.
        </p>
        <VendorHistory rows={history} agreements={listAgreements(vendorId)} intakes={sheets} />
      </Card>
    </div>
  );
}

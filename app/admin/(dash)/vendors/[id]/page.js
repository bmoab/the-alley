import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  BellRing,
  CalendarClock,
  ClipboardList,
  Eye,
  History,
  ChartNoAxesColumn,
  FolderTree,
  KeyRound,
  Layers,
  Mail,
  MessageSquareText,
  PackageOpen,
  PackagePlus,
  Link2,
  Phone,
  Tags,
  UserRound,
  Wallet,
} from "lucide-react";
import { REMINDERS, reminderKindFor, reminderHistory, getParty } from "@/lib/agreement-reminders.js";
import { requireAdmin, requireStaffManager, getActor, getCurrentUser, canManageStaff } from "@/lib/auth.js";
import {
  getVendor,
  listItems,
  listIntakes,
  listSales,
  listPayouts,
  consignorBalances,
  payoutCutoff,
  consignorShare,
  recordPayout,
  splitFor,
  round2,
  needsTerms,
  payoutLines,
  listDropoffs,
  unlinkedSquareItems,
  artistForVendor,
  makerInsights,
  suggestedGroups,
} from "@/lib/inventory.js";
import { getAccountByEmail } from "@/lib/accounts.js";
import { isSquareConfigured } from "@/lib/square.js";
import { listMakerCategories, pickMakerCategory, CONSIGNMENT_CATEGORY } from "@/lib/square-retail.js";
import { makerPayoutStatement } from "@/lib/email.js";
import { vendorHistory, listAgreements, reminderFor } from "@/lib/vendor-record.js";
import { formatPayout } from "@/lib/payout.js";
import PayoutMethodField from "@/components/maker/PayoutMethodField.js";
import VendorHistory from "@/components/maker/VendorHistory.js";
import { logActivity } from "@/lib/activity.js";
import { formatDateShort, formatMoney, venueToday, venueDayOf } from "@/lib/constants.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import Badge from "@/components/admin/ui/Badge.js";
import Button from "@/components/admin/ui/Button.js";
import CopyField from "@/components/admin/ui/CopyField.js";
import EditCard from "@/components/admin/ui/EditCard.js";
import Select from "@/components/admin/ui/Select.js";
import Toggle from "@/components/admin/ui/Toggle.js";
import ConfirmButton from "@/components/admin/ui/ConfirmButton.js";
import { fmtDay } from "@/lib/shift-format.js";
import SalesInsights from "@/components/maker/SalesInsights.js";
import ItemSetup from "@/components/maker/ItemSetup.js";
import {
  saveMaker,
  saveMoney,
  saveSquareCategory,
  linkFromSquare,
  saveGroups,
  sortGroupsByName,
  toggleVendor,
  makeLink,
  newLink,
} from "../actions.js";
import { initials } from "../../directory/shared.js";

export function generateMetadata({ params }) {
  const v = getVendor(Number(params.id));
  return { title: v ? v.name : "Maker" };
}
export const dynamic = "force-dynamic";

function back(id, message, type = "success", hash = "") {
  revalidatePath(`/admin/vendors/${id}`);
  revalidatePath("/admin/vendors");
  redirect(`/admin/vendors/${id}?toast=${encodeURIComponent(message)}&toastType=${type}${hash}`);
}

/** Paying a consignor moves money, so it's owner/admin only — like the booking money actions. */
async function pay(formData) {
  "use server";
  await requireStaffManager();
  const id = Number(formData.get("id"));
  const actor = await getActor();
  let payout;
  try {
    payout = recordPayout({
      vendorId: id,
      through: (formData.get("through") || "").toString(),
      method: formData.get("method"),
      reference: formData.get("reference"),
      paidOn: (formData.get("paid_on") || "").toString() || venueToday(),
      by: actor.actorName,
    });
  } catch (err) {
    back(id, err.message, "error");
  }
  const v = getVendor(id);
  const emailIt = formData.get("email_statement") != null;
  const sent = await makerPayoutStatement(v, payout, payoutLines(payout.id), { email: emailIt });
  logActivity({
    eventType: "consignor_paid",
    description: `Paid ${v.name} ${formatMoney(payout.amount)} for sales through ${formatDateShort(payout.through)}`,
    amount: payout.amount,
    metadata: { payoutId: payout.id },
    ...actor,
  });
  back(
    id,
    `Recorded ${formatMoney(payout.amount)} paid to ${v.name}.${
      !v.email ? "" : emailIt ? (sent.ok ? " Statement emailed and in their account." : " The statement email failed — it's in their account.") : " Statement is in their account."
    }`,
    "success",
    "#payouts"
  );
}

function Row({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <span className="shrink-0 text-ink-muted">{label}</span>
      <span className="min-w-0 truncate text-right font-medium text-ink">{children}</span>
    </div>
  );
}

const Empty = ({ children }) => <span className="font-normal text-ink-muted">{children}</span>;

function Heading({ icon: Icon, children }) {
  return (
    <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">
      <Icon className="h-4 w-4" aria-hidden="true" /> {children}
    </h2>
  );
}

function Stat({ value, label, tone }) {
  return (
    <div className={tone === "due" ? "card border-verde-deep/40 bg-verde/30 p-4" : "card p-4"}>
      <p className="text-2xl font-semibold tabular-nums text-ink">{value}</p>
      <p className="mt-0.5 text-xs text-ink-muted">{label}</p>
    </div>
  );
}

/**
 * One maker: who they are, their private link, what they've sold and what
 * they're owed, and their details — each a summary until you press Edit.
 */
export default async function VendorPage({ params }) {
  await requireAdmin();
  const me = await getCurrentUser();
  const manager = canManageStaff(me);
  const vendor = getVendor(Number(params.id));
  if (!vendor) notFound();
  const account = vendor.email ? getAccountByEmail(vendor.email) : null;
  const hasAccount = !!account?.email_verified_at;
  const appUrl = process.env.APP_URL || "";
  const link = vendor.portal_token ? `${appUrl}/maker/${vendor.portal_token}` : null;
  const waitingDropoffs = listDropoffs({ vendorId: vendor.id, status: "submitted" });
  const textBody = `Hi! Here's your page for The Alley — list what you're bringing in, and see your sales and payouts: ${
    link || `${appUrl}/account/sign-up`
  }`;
  const items = listItems({ vendorId: vendor.id, status: "all" });
  const intakes = listIntakes({ vendorId: vendor.id, limit: 20 });
  const sales = listSales({ vendorId: vendor.id });
  const payouts = listPayouts({ vendorId: vendor.id });
  const balance = consignorBalances()[vendor.id] || { owed: 0, sales: 0, lines: 0 };
  const cutoff = payoutCutoff();
  const dueNow = consignorBalances({ through: cutoff })[vendor.id]?.owed || 0;
  const unpaid = sales.filter((s) => !s.payout_id);
  const soldUnits = sales.reduce((t, s) => t + Number(s.qty), 0);
  const soldNet = round2(sales.reduce((t, s) => t + Number(s.net), 0));
  const agreementEnds = getParty("maker", vendor.id)?.endsOn || null;
  const dueKind = vendor.is_active && vendor.email ? reminderKindFor(agreementEnds) : null;
  const reminders = reminderHistory("maker", vendor.id).filter((h) => h.ends_on === agreementEnds);
  const reminderDue = dueKind && !reminders.some((h) => h.kind === dueKind) ? dueKind : null;
  const share = splitFor(null, vendor);
  const artist = artistForVendor(vendor);
  // Their costs are theirs alone: never sent to the admin's browser.
  const raw = makerInsights(vendor.id);
  const insights = { ...raw, items: raw.items.map(({ cost, ...i }) => ({ ...i, cost: null })) };
  const soldEver = new Set(Object.keys(insights.periods.find((p) => p.key === "all").byItem).map(Number));
  const groupItems = insights.items.filter((i) => i.active || soldEver.has(i.id));
  const groupSuggestions = suggestedGroups(vendor.id);
  const termsOk = !needsTerms(vendor);
  const remind = reminderFor(vendor);
  const history = vendorHistory(vendor.id);
  const hidden = { id: vendor.id };
  // Their category in Square: picked here, or found / made by name.
  let squareCats = null;
  if (isSquareConfigured()) {
    try {
      squareCats = await listMakerCategories();
    } catch {
      squareCats = null;
    }
  }
  const squareCat = squareCats ? pickMakerCategory(squareCats, vendor.name, vendor.square_category_id) : null;
  // Their items typed straight into Square before drop-offs came through here.
  let unlinked = [];
  if (squareCat) {
    try {
      ({ rows: unlinked } = await unlinkedSquareItems(vendor, squareCats));
    } catch {
      unlinked = [];
    }
  }

  const moneyView = (
    <>
      <Row label="Their share">
        {share}% of each sale{vendor.default_split == null ? <span className="font-normal text-ink-muted"> (shop share)</span> : null}
      </Row>
      <Row label="Paid by">{vendor.payout_method ? formatPayout(vendor.payout_method) : <Empty>Not set yet — they can pick on their page</Empty>}</Row>
      <Row label="Email">{vendor.email || <Empty>None yet</Empty>}</Row>
    </>
  );

  return (
    <div>
      <PageHeader eyebrow="Makers" title={vendor.name} />

      {/* Who they are */}
      <section className="card mb-6 flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
        <span className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-verde/60 text-2xl font-semibold text-verde-deep">
          {initials(vendor.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {vendor.is_active ? <Badge tone="sage">Active</Badge> : <Badge tone="neutral">Inactive</Badge>}
            <span className="rounded-full bg-paper-warm px-2.5 py-0.5 text-xs font-semibold text-ink-soft">{share}% to them</span>
            {hasAccount ? <Badge tone="success">Has an account</Badge> : <Badge tone="neutral">No account yet</Badge>}
            {termsOk ? <Badge tone="success">Terms agreed</Badge> : <Badge tone="warning">Terms not agreed</Badge>}
            {artist ? (
              <Link href={`/admin/exhibitors/${artist.id}`} className="transition hover:opacity-80">
                <Badge tone="sky">Gallery artist: {artist.name} →</Badge>
              </Link>
            ) : null}
          </div>
          {vendor.contact_name ? <p className="mt-2 text-sm text-ink-soft">{vendor.contact_name}</p> : null}
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {vendor.email ? (
              <a href={`mailto:${vendor.email}`} className="inline-flex items-center gap-1.5 text-verde-deep hover:underline">
                <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                {vendor.email}
              </a>
            ) : null}
            {vendor.phone ? (
              <a href={`tel:${vendor.phone}`} className="inline-flex items-center gap-1.5 text-verde-deep hover:underline">
                <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                {vendor.phone}
              </a>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            {!vendor.email
              ? "No email yet — add one under Money so they can make an account."
              : hasAccount
                ? account.last_login_at
                  ? `Last signed in ${formatDateShort(venueDayOf(account.last_login_at))}.`
                  : "Signed up, hasn't been back yet."
                : `They can make an account with ${vendor.email}.`}{" "}
            {termsOk
              ? `Agreed to the terms ${formatDateShort(venueDayOf(vendor.terms_accepted_at))} as “${vendor.terms_accepted_name}”.`
              : vendor.terms_accepted_at
                ? "The terms changed since they agreed — they'll be asked again."
                : "They're asked to agree to the terms first thing."}
          </p>
        </div>
      </section>

      {agreementEnds ? (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-paper-warm px-4 py-3 text-sm">
          <CalendarClock className="h-4 w-4 text-ink-muted" aria-hidden="true" />
          <span className="font-semibold text-ink">Agreement ends {formatDateShort(agreementEnds)}</span>
          {reminders.map((h) => (
            <span key={h.id} className="text-ink-soft">
              {REMINDERS[h.kind]?.label || h.kind}: {h.skipped ? "Handled without email" : "Sent"} {formatDateShort(venueDayOf(h.sent_at))}
            </span>
          ))}
          {reminderDue ? (
            <Button href={`/admin/agreements/maker/${vendor.id}?kind=${reminderDue}`} size="sm" variant="accent" className="ml-auto">
              Send the {REMINDERS[reminderDue].label}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="mb-6 flex flex-wrap gap-2">
        <Button href={`/admin/inventory/receive?vendor=${vendor.id}`} variant="accent" icon={PackagePlus}>
          Receive stock from them
        </Button>
        <Button href={`/admin/inventory?vendor=${vendor.id}&status=all`} variant="ghost" icon={Tags}>
          Their items
        </Button>
        <Button href={`/admin/maker-view/${vendor.id}`} variant="ghost" icon={Eye}>
          See their page
        </Button>
        {remind ? (
          <Button href={`/admin/vendors/remind?id=${vendor.id}`} variant="ghost" icon={BellRing}>
            Remind them
          </Button>
        ) : null}
        {waitingDropoffs.length ? (
          <Button href={`/admin/inventory/receive?dropoff=${waitingDropoffs[0].id}`} variant="ghost" icon={PackageOpen}>
            Count in their drop-off ({waitingDropoffs[0].units} items)
          </Button>
        ) : null}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat value={items.reduce((t, i) => t + i.qty_on_hand, 0)} label="On the shelf now" />
        <Stat value={soldUnits} label={`Sold · ${formatMoney(soldNet)} after discounts`} />
        <Stat
          value={formatMoney(dueNow)}
          tone={dueNow ? "due" : null}
          label={`Due now, for sales through ${formatDateShort(cutoff)}${
            balance.owed > dueNow ? ` · ${formatMoney(balance.owed - dueNow)} more this month, paid next month` : ""
          }`}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-6">
          {/* What's selling */}
          <section id="selling" className="card p-5">
            <Heading icon={ChartNoAxesColumn}>How it&apos;s selling</Heading>
            <SalesInsights items={insights.items} periods={insights.periods} months={insights.months} whose="their" />
          </section>

          {/* Their private link */}
          <section id="access" className="card p-5">
            <Heading icon={KeyRound}>Their private link</Heading>
            <p className="mt-2 text-sm text-ink-soft">
              {vendor.name} uses this to list what they&apos;re bringing in and see their sales and payouts. No password needed.
            </p>
            {link ? (
              <>
                <CopyField url={link} className="mt-3" />
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {vendor.phone ? (
                    <Button
                      href={`sms:${vendor.phone}?&body=${encodeURIComponent(textBody)}`}
                      as="a"
                      variant="subtle"
                      size="sm"
                      icon={MessageSquareText}
                    >
                      Text it to them
                    </Button>
                  ) : null}
                  <span className="text-xs text-ink-muted">Anyone with this link sees their sales — send it only to them.</span>
                </div>
                {manager ? (
                  <form action={newLink} className="mt-4">
                    <input type="hidden" name="id" value={vendor.id} />
                    <ConfirmButton
                      label="Replace this link"
                      variant="ghost"
                      confirmLabel="Yes, make a new link"
                      pendingLabel="Replacing…"
                      question="The old link stops working right away. Use this if it was forwarded or shared by mistake."
                    />
                  </form>
                ) : null}
              </>
            ) : (
              <form action={makeLink} className="mt-3">
                <input type="hidden" name="id" value={vendor.id} />
                <Button type="submit" size="sm">Make a private link</Button>
              </form>
            )}
          </section>

          {/* Pay them */}
          <section id="payouts" className="card p-5">
            <Heading icon={Wallet}>Pay them</Heading>
            <p className="mt-2 text-sm text-ink-soft">
              Monthly: early each month, pay them for everything sold the month before.
            </p>
            {unpaid.length ? (
              <>
                <div className="mt-4 overflow-x-auto rounded-xl border border-line">
                  <table className="w-full text-sm">
                    <thead className="bg-paper-warm">
                      <tr className="text-left text-xs font-semibold text-ink-muted">
                        <th className="px-3 py-2">Sold</th>
                        <th className="px-3 py-2">Item</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2 text-right">Sale</th>
                        <th className="px-3 py-2 text-right">Their share</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {unpaid.map((s) => (
                        <tr key={s.id}>
                          <td className="whitespace-nowrap px-3 py-2 text-ink-soft">{fmtDay(s.sold_at.slice(0, 10))}</td>
                          <td className="px-3 py-2 text-ink">
                            {s.name}
                            {s.is_return ? <span className="ml-1 text-xs text-rust">(return)</span> : null}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{s.qty}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(s.net)}</td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums text-ink">{formatMoney(consignorShare(s))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {manager ? (
                  <form action={pay} className="mt-4 space-y-4 rounded-xl bg-paper-warm p-4">
                    <input type="hidden" name="id" value={vendor.id} />
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="label" htmlFor="pay-through">Covers sales up to</label>
                        <input id="pay-through" name="through" type="date" defaultValue={cutoff} required className="field" />
                      </div>
                      <div>
                        <label className="label" htmlFor="pay-on">Paid on</label>
                        <input id="pay-on" name="paid_on" type="date" defaultValue={venueToday()} required className="field" />
                      </div>
                      <div>
                        <label className="label" htmlFor="pay-how">How</label>
                        <input id="pay-how" name="method" defaultValue={formatPayout(vendor.payout_method)} className="field" placeholder="Venmo, Zelle, check…" />
                      </div>
                      <div>
                        <label className="label" htmlFor="pay-ref">Transaction ID or check #</label>
                        <input id="pay-ref" name="reference" className="field" placeholder="From the Venmo or Zelle receipt" />
                      </div>
                    </div>
                    {vendor.email ? (
                      <Toggle
                        name="email_statement"
                        label="Also email them the statement"
                        hint="It always goes in their account either way."
                      />
                    ) : null}
                    <div>
                      <Button type="submit">Record payment</Button>
                      <p className="mt-2 text-xs text-ink-muted">
                        Pay them first from The Alley&apos;s business account (Venmo, Zelle, check), then record it here with the
                        transaction ID. The amount is worked out from the sales above — nothing to type.
                      </p>
                    </div>
                  </form>
                ) : (
                  <p className="mt-3 text-xs text-ink-muted">An owner or admin records payouts.</p>
                )}
              </>
            ) : (
              <p className="mt-3 rounded-xl bg-paper-warm px-4 py-3 text-sm text-ink-muted">Nothing owed — no unpaid sales.</p>
            )}

            {payouts.length ? (
              <>
                <h3 className="mt-6 text-sm font-semibold text-ink">Paid so far</h3>
                <ul className="mt-2 divide-y divide-line text-sm">
                  {payouts.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2.5">
                      <span className="font-semibold tabular-nums text-ink">{formatMoney(p.amount)}</span>
                      <span className="text-ink-soft">
                        on {formatDateShort(p.paid_on)} · {p.line_count} sale{p.line_count === 1 ? "" : "s"} through{" "}
                        {formatDateShort(p.through)} ({formatMoney(p.sales_total)} sold)
                      </span>
                      <span className="text-xs text-ink-muted">
                        {[p.method && formatPayout(p.method), p.reference].filter(Boolean).join(" · ")} · by {p.created_by}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>

          {/* Stock sheets */}
          <section className="card p-5">
            <Heading icon={ClipboardList}>Stock sheets</Heading>
            {intakes.length ? (
              <ul className="mt-3 divide-y divide-line text-sm">
                {intakes.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/admin/inventory/intake/${s.id}`}
                      className="-mx-2 flex flex-wrap items-center gap-2 rounded-lg px-2 py-2.5 transition hover:bg-paper-dim"
                    >
                      <span className="font-semibold text-ink">
                        #{s.id} · {formatDateShort(s.received_on)}
                      </span>
                      <span className="text-ink-muted">
                        {s.units} item{Math.abs(s.units) === 1 ? "" : "s"}
                        {s.notes ? ` · ${s.notes}` : ""}
                      </span>
                      {s.square_status !== "synced" ? <Badge tone="danger">Not in Square</Badge> : null}
                      {s.units > 0 ? (
                        s.confirmed_at ? <Badge tone="success">Confirmed by them</Badge> : <Badge tone="neutral">Not confirmed yet</Badge>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-ink-muted">None yet.</p>
            )}
          </section>

          {/* Their record */}
          <section id="record" className="card p-5">
            <Heading icon={History}>Record</Heading>
            <p className="mt-2 text-sm text-ink-soft">
              Everything between {vendor.name} and The Alley, newest first. They see the same list on their page.
            </p>
            <VendorHistory
              rows={history}
              agreements={listAgreements(vendor.id)}
              intakeHref={(intakeId) => `/admin/inventory/intake/${intakeId}`}
            />
          </section>
        </div>

        <div className="space-y-6">
          <EditCard
            title="Maker"
            icon={<UserRound className="h-4 w-4" aria-hidden="true" />}
            action={saveMaker}
            hidden={hidden}
            view={
              <>
                <Row label="Name">{vendor.name}</Row>
                <Row label="Contact">{vendor.contact_name || <Empty>None yet</Empty>}</Row>
                <Row label="Phone">{vendor.phone || <Empty>None yet</Empty>}</Row>
                {vendor.notes ? <p className="mt-2 rounded-lg bg-paper-warm px-3 py-2 text-sm text-ink-soft">{vendor.notes}</p> : null}
              </>
            }
          >
            <div>
              <label className="label" htmlFor="mk-name">Name or shop name</label>
              <input id="mk-name" name="name" required defaultValue={vendor.name} className="field" />
            </div>
            <div>
              <label className="label" htmlFor="mk-contact">Contact person</label>
              <input id="mk-contact" name="contact_name" defaultValue={vendor.contact_name || ""} className="field" />
            </div>
            <div>
              <label className="label" htmlFor="mk-phone">Phone</label>
              <input id="mk-phone" name="phone" type="tel" defaultValue={vendor.phone || ""} className="field" />
            </div>
            <div>
              <label className="label" htmlFor="mk-notes">Notes</label>
              <textarea id="mk-notes" name="notes" rows={3} defaultValue={vendor.notes || ""} className="field !h-auto" />
            </div>
          </EditCard>

          {manager ? (
            <EditCard
              title="Money"
              icon={<Wallet className="h-4 w-4" aria-hidden="true" />}
              action={saveMoney}
              hidden={hidden}
              view={moneyView}
            >
              <div>
                <label className="label" htmlFor="mk-split">Their share of each sale</label>
                <div className="relative">
                  <input id="mk-split" name="default_split" inputMode="decimal" defaultValue={vendor.default_split ?? ""} placeholder={`${share} (shop share)`} className="field pr-8" />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-muted">%</span>
                </div>
                <p className="mt-1 text-xs text-ink-muted">
                  Leave blank to use the shop share (Makers → Share and consignment terms). A change asks them to agree again on
                  their page, with a note; sales from then on use it.
                </p>
              </div>
              <PayoutMethodField defaultValue={vendor.payout_method || ""} label="How they like to be paid" id="mk-pay" />
              <div>
                <label className="label" htmlFor="mk-email">Email</label>
                <input id="mk-email" name="email" type="email" defaultValue={vendor.email || ""} className="field" />
                <p className="mt-1 text-xs text-ink-muted">Their email is what links them to their account — change it only if they ask.</p>
              </div>
            </EditCard>
          ) : (
            <section className="card p-5">
              <Heading icon={Wallet}>Money</Heading>
              <div className="mt-3">{moneyView}</div>
              <p className="mt-2 text-xs text-ink-muted">An owner or admin changes these.</p>
            </section>
          )}

          <EditCard
            title="In Square"
            icon={<FolderTree className="h-4 w-4" aria-hidden="true" />}
            action={saveSquareCategory}
            hidden={hidden}
            view={
              !isSquareConfigured() ? (
                <p className="text-sm text-ink-muted">Square isn&apos;t connected.</p>
              ) : !squareCats ? (
                <p className="text-sm text-ink-muted">Square can&apos;t be reached right now.</p>
              ) : squareCat ? (
                <>
                  <Row label="Category">{squareCat.name}</Row>
                  <p className="mt-1 text-xs text-ink-muted">
                    Inside {CONSIGNMENT_CATEGORY}. Their items go in here when a drop-off is received.
                  </p>
                </>
              ) : (
                <>
                  <Row label="Category">
                    <Empty>Not yet</Empty>
                  </Row>
                  <p className="mt-1 text-xs text-ink-muted">
                    Their first drop-off makes &ldquo;{vendor.name}&rdquo; inside {CONSIGNMENT_CATEGORY} in Square.
                  </p>
                </>
              )
            }
          >
            {squareCats ? (
              <div>
                <label className="label" htmlFor="mk-cat">Their category in Square</label>
                <Select id="mk-cat" name="square_category_id" defaultValue={squareCat?.picked ? squareCat.id : ""}>
                  <option value="">Match by name</option>
                  {squareCats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
                <p className="mt-1 text-xs text-ink-muted">
                  Only needed if their category in Square has a different name. Match by name finds theirs, or makes one with
                  their first drop-off.
                </p>
              </div>
            ) : (
              <p className="text-sm text-ink-muted">Square can&apos;t be reached right now. Try again in a minute.</p>
            )}
          </EditCard>

          {groupItems.length ? (
            <section id="groups" className="card p-5">
              <Heading icon={Layers}>Groups</Heading>
              <p className="mt-2 text-sm text-ink-soft">
                Optional. Put their items together (say Large Candle, with each scent inside) and How it&apos;s selling shows
                which group and which scent sells best. {vendor.name} can do this from their page too, and add their own costs
                there.
              </p>
              <details className="mt-3" open={!!groupSuggestions.length && !insights.items.some((i) => i.group)}>
                <summary className="text-sm font-semibold text-verde-deep">Sort their items</summary>
                <div className="mt-3">
                  <ItemSetup
                    // A fresh form whenever what's saved changes (sorting, saving).
                    key={groupItems.map((i) => `${i.id}:${i.group}:${i.cost}:${i.photo}`).join("|")}
                    items={groupItems}
                    suggestions={groupSuggestions}
                    hidden={hidden}
                    action={saveGroups}
                    groupAction={sortGroupsByName}
                    listId="vendor-groups"
                  />
                </div>
              </details>
            </section>
          ) : null}

          {unlinked.length ? (
            <section id="square-items" className="card border-verde-deep/40 p-5">
              <Heading icon={Link2}>Already in Square</Heading>
              <p className="mt-2 text-sm text-ink-soft">
                {unlinked.length === 1 ? "This item" : `These ${unlinked.length} items`} in their {squareCat.name} category
                {unlinked.length === 1 ? " was" : " were"} added straight in Square, so {unlinked.length === 1 ? "its sales don't" : "their sales don't"} show
                up under Pay them. Link {unlinked.length === 1 ? "it" : "them"} to {vendor.name} and sales from now on count toward
                what they&apos;re owed.
              </p>
              <ul className="mt-3 max-h-72 divide-y divide-line overflow-y-auto rounded-xl border border-line text-sm">
                {unlinked.map((r) => (
                  <li key={r.variationId} className="flex items-baseline justify-between gap-3 px-3 py-2">
                    <span className="min-w-0 truncate text-ink">
                      {r.name}
                      {r.variationName ? <span className="text-ink-muted"> — {r.variationName}</span> : null}
                    </span>
                    <span className="shrink-0 tabular-nums text-ink-soft">{r.price != null ? formatMoney(r.price) : "Price at the register"}</span>
                  </li>
                ))}
              </ul>
              <form action={linkFromSquare} className="mt-3">
                <input type="hidden" name="id" value={vendor.id} />
                {unlinked.map((r) => (
                  <input key={r.variationId} type="hidden" name="variation" value={r.variationId} />
                ))}
                <ConfirmButton
                  label={`Link ${unlinked.length === 1 ? "it" : `all ${unlinked.length}`} to ${vendor.name}`}
                  variant="accent"
                  confirmLabel="Yes, link them"
                  pendingLabel="Linking…"
                  question={`Sales from now on count toward ${vendor.name}'s payouts. Anything sold before today was paid the old way and isn't added. Nothing changes in Square.`}
                />
              </form>
            </section>
          ) : null}

          <section className={vendor.is_active ? "rounded-2xl border border-rust/20 p-5" : "rounded-2xl border border-line p-5"}>
            <h2 className={vendor.is_active ? "text-xs font-semibold uppercase tracking-wider text-rust" : "text-xs font-semibold uppercase tracking-wider text-ink-muted"}>
              {vendor.is_active ? "Stop selling" : "Inactive"}
            </h2>
            <p className="mt-2 text-sm text-ink-soft">
              {vendor.is_active
                ? `Hides ${vendor.name} from Receive stock. Their sales, payouts and stock sheets stay here.`
                : `${vendor.name} is hidden from Receive stock. Reactivate them to take in their stock again.`}
            </p>
            <form action={toggleVendor} className="mt-3">
              <input type="hidden" name="id" value={vendor.id} />
              <input type="hidden" name="active" value={vendor.is_active ? "0" : "1"} />
              <Button type="submit" variant={vendor.is_active ? "danger" : "ghost"} size="sm">
                {vendor.is_active ? "Mark inactive" : "Reactivate"}
              </Button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}

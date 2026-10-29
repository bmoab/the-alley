import Link from "next/link";
import { BellRing, Handshake, PackagePlus, Plus } from "lucide-react";
import { requireAdmin, getCurrentUser, canManageStaff } from "@/lib/auth.js";
import {
  listVendors,
  consignorBalances,
  payoutCutoff,
  defaultSplit,
  needsTerms,
  pickupDays,
  termsAreDraft,
  artistForVendor,
} from "@/lib/inventory.js";
import { getSetting } from "@/lib/db.js";
import { reminderFor } from "@/lib/vendor-record.js";
import { formatDateShort, formatMoney } from "@/lib/constants.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import Badge from "@/components/admin/ui/Badge.js";
import Button from "@/components/admin/ui/Button.js";
import Dialog from "@/components/admin/ui/Dialog.js";
import AddMakerForm from "@/components/admin/makers/AddMakerForm.js";
import { addVendor, updateTerms } from "./actions.js";
import { initials } from "../directory/shared.js";

export const metadata = { title: "Makers" };
export const dynamic = "force-dynamic";

function Stat({ value, label, tone }) {
  return (
    <div className={tone === "due" ? "card border-verde-deep/40 bg-verde/30 p-4" : "card p-4"}>
      <p className="text-2xl font-semibold tabular-nums text-ink">{value}</p>
      <p className="mt-0.5 text-xs text-ink-muted">{label}</p>
    </div>
  );
}

function MakerCard({ v, owedNow, soFar }) {
  return (
    <Link
      href={`/admin/vendors/${v.id}`}
      className={
        v.is_active
          ? "group card flex items-start gap-4 p-4 transition duration-200 hover:-translate-y-0.5 hover:border-verde-deep/40 hover:shadow-card-hover"
          : "group card flex items-start gap-4 p-4 opacity-60 transition hover:opacity-100"
      }
    >
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-verde/60 text-lg font-semibold text-verde-deep">
        {initials(v.name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-semibold text-ink">{v.name}</span>
        <span className="mt-0.5 block truncate text-xs text-ink-muted">{v.contact_name || v.email || "No contact yet"}</span>
        <span className="mt-3 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-paper-warm px-2.5 py-0.5 text-xs font-semibold text-ink-soft">
            {v.on_hand} on hand
          </span>
          {owedNow ? (
            <span className="rounded-full bg-verde/60 px-2.5 py-0.5 text-xs font-semibold text-ink">{formatMoney(owedNow)} due</span>
          ) : soFar ? (
            <span className="rounded-full bg-paper-warm px-2.5 py-0.5 text-xs text-ink-muted">{formatMoney(soFar)} so far</span>
          ) : null}
          {artistForVendor(v) ? <Badge tone="sky">Gallery artist</Badge> : null}
          {v.is_active && needsTerms(v) ? <Badge tone="warning">Terms not agreed</Badge> : null}
          {!v.is_active ? <Badge tone="neutral">Inactive</Badge> : null}
        </span>
      </span>
    </Link>
  );
}

/**
 * Everyone selling on consignment, as cards (tap one for their page), what's
 * due this month, and the terms they all agree to.
 */
export default async function VendorsPage() {
  await requireAdmin();
  const me = await getCurrentUser();
  const manager = canManageStaff(me);
  const vendors = listVendors({ includeInactive: true });
  const active = vendors.filter((v) => v.is_active);
  const inactive = vendors.filter((v) => !v.is_active);
  const balances = consignorBalances();
  const cutoff = payoutCutoff();
  const due = consignorBalances({ through: cutoff });
  const dueTotal = Object.values(due).reduce((t, b) => t + b.owed, 0);
  const dueCount = Object.values(due).filter((b) => b.owed > 0).length;
  const onShelf = active.reduce((t, v) => t + Number(v.on_hand || 0), 0);
  const noTerms = active.filter((v) => needsTerms(v)).length;
  const toRemind = active.filter((v) => reminderFor(v)).length;
  const monthName = new Date(cutoff + "T12:00:00").toLocaleDateString("en-US", { month: "long" });
  const draft = termsAreDraft();

  return (
    <div>
      <PageHeader
        title="Makers"
        subtitle="Everyone selling on consignment. They get their share of what sold, paid monthly for the month before — amounts come straight from Square sales."
        actions={
          <>
            <Button href="/admin/inventory/receive" variant="accent" icon={PackagePlus}>
              Receive stock
            </Button>
            <Dialog
              title="Add a maker"
              width={560}
              trigger={
                <>
                  <Plus className="h-4 w-4" aria-hidden="true" /> Add maker
                </>
              }
              triggerClassName="inline-flex h-10 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-paper transition hover:bg-ink-soft"
            >
              <AddMakerForm action={addVendor} manager={manager} defaultSplit={defaultSplit()} terms={getSetting("consignment_terms", "")} />
            </Dialog>
          </>
        }
      />

      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          value={dueTotal ? formatMoney(dueTotal) : "$0"}
          label={
            dueTotal
              ? `${monthName} payouts to ${dueCount} maker${dueCount === 1 ? "" : "s"} · sales through ${formatDateShort(cutoff)}`
              : `No payouts due for ${monthName}`
          }
          tone={dueTotal ? "due" : null}
        />
        <Stat value={active.length} label={active.length === 1 ? "Maker selling now" : "Makers selling now"} />
        <Stat value={onShelf} label="Items on the shelf" />
        <Stat value={noTerms} label={noTerms === 1 ? "Hasn't agreed to the terms" : "Haven't agreed to the terms"} />
      </div>

      {toRemind ? (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-paper-warm px-4 py-3 text-sm">
          <BellRing className="h-4 w-4 text-ink-muted" aria-hidden="true" />
          <span className="text-ink">
            {toRemind} {toRemind === 1 ? "maker or artist hasn't" : "makers and artists haven't"} agreed to the current terms or made
            an account yet.
          </span>
          <Button href="/admin/vendors/remind" size="sm" variant="accent" className="ml-auto">
            Remind them
          </Button>
        </div>
      ) : null}

      {active.length ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {active.map((v) => (
            <MakerCard key={v.id} v={v} owedNow={due[v.id]?.owed || 0} soFar={balances[v.id]?.owed || 0} />
          ))}
        </div>
      ) : (
        <div className="card flex flex-col items-center gap-2 p-10 text-center">
          <Handshake className="h-8 w-8 text-verde-deep" aria-hidden="true" />
          <p className="font-semibold text-ink">No makers yet</p>
          <p className="text-sm text-ink-muted">They&apos;re added the first time you receive stock from them, or with “Add maker” above.</p>
        </div>
      )}

      {inactive.length ? (
        <>
          <h2 className="mt-12 text-xl font-semibold text-ink">Inactive</h2>
          <p className="mt-1 text-sm text-ink-muted">Hidden from Receive stock. Open one to reactivate them.</p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {inactive.map((v) => (
              <MakerCard key={v.id} v={v} owedNow={due[v.id]?.owed || 0} soFar={balances[v.id]?.owed || 0} />
            ))}
          </div>
        </>
      ) : null}

      <details id="terms" className="card mt-12 p-5" open={draft}>
        <summary className="flex cursor-pointer items-center gap-2 font-semibold text-ink">
          Share and consignment terms <span className="font-normal text-ink-muted">· {defaultSplit()}% to makers and artists</span>
          {draft ? <Badge tone="warning">Draft — please review</Badge> : null}
        </summary>
        <p className="mt-2 max-w-prose text-sm text-ink-soft">
          Every maker and artist agrees to these (typing their name) before they can list a drop-off. {"{split}"} becomes their
          share and {"{days}"} the days below. Someone with their own share (on their page, under Money) keeps it.
        </p>
        <p className="mt-2 max-w-prose text-sm text-ink-soft">
          These are the general terms: a change here is for new makers and anyone who hasn&apos;t agreed yet. Everyone who&apos;s
          agreed keeps the terms and share they agreed to. To give one person their own terms or share, change them as you add
          them, or later on their page under Terms; if they&apos;ve agreed already, they&apos;re asked to agree to the new ones.
        </p>
        {manager ? (
          <form action={updateTerms} className="mt-4 space-y-3">
            <textarea name="terms" rows={18} defaultValue={getSetting("consignment_terms", "")} className="field !h-auto font-mono text-xs" />
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-48">
                <label className="label" htmlFor="terms-split">Makers&apos; and artists&apos; share</label>
                <div className="relative">
                  <input id="terms-split" name="split" inputMode="decimal" defaultValue={defaultSplit()} required className="field pr-8" />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-muted">%</span>
                </div>
              </div>
              <div className="w-40">
                <label className="label" htmlFor="terms-days">Days on the shelf</label>
                <input id="terms-days" name="days" inputMode="numeric" defaultValue={pickupDays()} className="field" />
              </div>
              <Button type="submit">Save</Button>
            </div>
            <label className="flex max-w-prose items-start gap-2 text-sm text-ink-soft">
              <input type="checkbox" name="everyone" className="mt-1" />
              <span>
                Also put everyone on these terms, including anyone with their own, and ask them to agree. They keep their own
                share, and can keep listing once they agree.
              </span>
            </label>
          </form>
        ) : (
          <p className="mt-3 whitespace-pre-line rounded-xl bg-paper-warm p-4 text-sm text-ink-soft">{getSetting("consignment_terms", "")}</p>
        )}
      </details>
    </div>
  );
}

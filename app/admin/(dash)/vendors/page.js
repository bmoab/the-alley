import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireStaffManager, getActor, getCurrentUser, canManageStaff } from "@/lib/auth.js";
import {
  listVendors,
  createVendor,
  consignorBalances,
  payoutCutoff,
  defaultSplit,
  needsTerms,
  pickupDays,
  saveTerms,
  termsAreDraft,
} from "@/lib/inventory.js";
import { getSetting } from "@/lib/db.js";
import { logActivity } from "@/lib/activity.js";
import { formatDateShort, formatMoney } from "@/lib/constants.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import Badge from "@/components/admin/ui/Badge.js";
import Button from "@/components/admin/ui/Button.js";

export const metadata = { title: "Makers" };
export const dynamic = "force-dynamic";

async function addVendor(formData) {
  "use server";
  await requireAdmin();
  const manager = canManageStaff(await getCurrentUser());
  let v;
  try {
    v = createVendor({
      name: formData.get("name"),
      contact_name: formData.get("contact_name"),
      email: formData.get("email"),
      phone: formData.get("phone"),
      // A share other than the usual is an owner/admin call.
      default_split: manager ? formData.get("default_split") : undefined,
      payout_method: formData.get("payout_method"),
      notes: formData.get("notes"),
    });
  } catch (err) {
    redirect(`/admin/vendors?toast=${encodeURIComponent(err.message)}&toastType=error`);
  }
  logActivity({ eventType: "vendor_added", description: `Added maker ${v.name}`, ...(await getActor()) });
  revalidatePath("/admin/vendors");
  redirect(`/admin/vendors/${v.id}?toast=${encodeURIComponent(`${v.name} added.`)}&toastType=success`);
}

async function updateTerms(formData) {
  "use server";
  await requireStaffManager();
  try {
    saveTerms({ text: formData.get("terms"), days: formData.get("days") });
  } catch (err) {
    redirect(`/admin/vendors?toast=${encodeURIComponent(err.message)}&toastType=error#terms`);
  }
  logActivity({ eventType: "consignment_terms_updated", description: "Updated the consignment terms", ...(await getActor()) });
  revalidatePath("/admin/vendors");
  redirect(`/admin/vendors?toast=${encodeURIComponent("Terms saved. Makers will be asked to agree to the new version.")}&toastType=success`);
}

export default async function VendorsPage() {
  await requireAdmin();
  const me = await getCurrentUser();
  const vendors = listVendors({ includeInactive: true });
  const balances = consignorBalances();
  const cutoff = payoutCutoff();
  const due = consignorBalances({ through: cutoff });
  const dueTotal = Object.values(due).reduce((t, b) => t + b.owed, 0);
  const dueCount = Object.values(due).filter((b) => b.owed > 0).length;
  const monthName = new Date(cutoff + "T12:00:00").toLocaleDateString("en-US", { month: "long" });

  return (
    <div>
      <PageHeader
        title="Makers"
        subtitle="Everyone selling on consignment. They get their share of what sold, paid monthly for the month before — amounts come straight from Square sales."
      />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Button href="/admin/inventory/receive" variant="accent">+ Receive stock</Button>
        {dueTotal ? (
          <p className="text-sm text-ink-soft">
            <strong className="text-ink">{monthName} payouts: {formatMoney(dueTotal)}</strong> to {dueCount} maker
            {dueCount === 1 ? "" : "s"} (sales through {formatDateShort(cutoff)}).
          </p>
        ) : (
          <p className="text-sm text-ink-muted">No payouts due for {monthName}.</p>
        )}
      </div>

      <details className="card mb-6 p-5">
        <summary className="cursor-pointer font-semibold text-ink">+ Add a maker</summary>
        <form action={addVendor} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Name / shop name</label>
            <input name="name" required className="field" />
          </div>
          <div>
            <label className="label">Contact person</label>
            <input name="contact_name" className="field" />
          </div>
          <div>
            <label className="label">Their share of each sale (%)</label>
            <input name="default_split" inputMode="decimal" placeholder={`${defaultSplit()} (shop default)`} className="field" />
          </div>
          <div>
            <label className="label">Email (their account sign-in)</label>
            <input name="email" type="email" className="field" />
          </div>
          <div>
            <label className="label">Phone</label>
            <input name="phone" type="tel" className="field" />
          </div>
          <div>
            <label className="label">How they like to be paid</label>
            <input name="payout_method" className="field" placeholder="Venmo @…, check, Zelle…" />
          </div>
          <div>
            <label className="label">Notes</label>
            <input name="notes" className="field" />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit">Add</Button>
          </div>
        </form>
      </details>

      {vendors.length === 0 ? (
        <p className="text-sm text-ink-muted">Nobody yet — they&apos;re added the first time you receive stock from them, or here.</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-paper">
          {vendors.map((v) => {
            const b = balances[v.id];
            return (
              <li key={v.id} className={v.is_active ? "" : "opacity-60"}>
                <Link href={`/admin/vendors/${v.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-paper-dim">
                  <span className="font-semibold text-ink">{v.name}</span>
                  {v.is_active && needsTerms(v) ? <Badge tone="warning">terms not agreed</Badge> : null}
                  {!v.is_active ? <Badge tone="neutral">inactive</Badge> : null}
                  <span className="text-xs text-ink-muted">
                    {v.item_count} product{v.item_count === 1 ? "" : "s"} · {v.on_hand} on hand
                  </span>
                  {due[v.id]?.owed ? (
                    <span className="ml-auto text-sm font-semibold text-ink">{formatMoney(due[v.id].owed)} due</span>
                  ) : b?.owed ? (
                    <span className="ml-auto text-xs text-ink-muted">{formatMoney(b.owed)} so far this month</span>
                  ) : (
                    <span className="ml-auto text-xs text-ink-muted">→</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <details id="terms" className="card mt-8 p-5" open={termsAreDraft()}>
        <summary className="cursor-pointer font-semibold text-ink">
          Consignment terms {termsAreDraft() ? <Badge tone="warning">draft — please review</Badge> : null}
        </summary>
        <p className="mt-2 text-sm text-ink-soft">
          Every maker agrees to these (typing their name) before they can list a drop-off. {"{split}"} becomes their % and{" "}
          {"{days}"} the days below. Saving a change asks every maker to agree again.
        </p>
        {canManageStaff(me) ? (
          <form action={updateTerms} className="mt-3 space-y-3">
            <textarea name="terms" rows={18} defaultValue={getSetting("consignment_terms", "")} className="field !h-auto font-mono text-xs" />
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-40">
                <label className="label">Days on the shelf</label>
                <input name="days" inputMode="numeric" defaultValue={pickupDays()} className="field" />
              </div>
              <Button type="submit">Save terms</Button>
            </div>
          </form>
        ) : (
          <p className="mt-3 whitespace-pre-line text-sm text-ink-soft">{getSetting("consignment_terms", "")}</p>
        )}
      </details>
    </div>
  );
}

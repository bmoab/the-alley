import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin, requireStaffManager, getActor, getCurrentUser, canManageStaff } from "@/lib/auth.js";
import {
  getVendor,
  updateVendor,
  setVendorActive,
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
  ensureVendorToken,
  rotateVendorToken,
  needsTerms,
  payoutLines,
  listDropoffs,
} from "@/lib/inventory.js";
import { getAccountByEmail } from "@/lib/accounts.js";
import { makerPayoutStatement } from "@/lib/email.js";
import { logActivity } from "@/lib/activity.js";
import { formatDateShort, formatMoney, venueToday } from "@/lib/constants.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import Card from "@/components/admin/ui/Card.js";
import Badge from "@/components/admin/ui/Badge.js";
import Button from "@/components/admin/ui/Button.js";
import { fmtDay } from "@/lib/shift-format.js";

export const metadata = { title: "Maker" };
export const dynamic = "force-dynamic";

function back(id, message, type = "success", hash = "") {
  revalidatePath(`/admin/vendors/${id}`);
  revalidatePath("/admin/vendors");
  redirect(`/admin/vendors/${id}?toast=${encodeURIComponent(message)}&toastType=${type}${hash}`);
}

async function saveVendor(formData) {
  "use server";
  await requireAdmin();
  // Their share, the email their account matches on and where their money
  // goes are owner/admin only — like paying them.
  const manager = canManageStaff(await getCurrentUser());
  const id = Number(formData.get("id"));
  let v;
  try {
    v = updateVendor(id, {
      name: formData.get("name"),
      contact_name: formData.get("contact_name"),
      email: manager ? formData.get("email") : undefined,
      phone: formData.get("phone"),
      default_split: manager ? formData.get("default_split") : undefined,
      payout_method: manager ? formData.get("payout_method") : undefined,
      notes: formData.get("notes"),
    });
  } catch (err) {
    back(id, err.message, "error");
  }
  logActivity({ eventType: "vendor_updated", description: `Updated ${v.name}`, ...(await getActor()) });
  back(id, "Saved.");
}

async function toggleVendor(formData) {
  "use server";
  await requireAdmin();
  const id = Number(formData.get("id"));
  const active = formData.get("active") === "1";
  setVendorActive(id, active);
  back(id, active ? "Reactivated." : "Marked inactive — they're hidden from Receive stock.", "neutral");
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

async function makeLink(formData) {
  "use server";
  await requireAdmin();
  const id = Number(formData.get("id"));
  ensureVendorToken(id);
  back(id, "Private link made — copy it below.", "success", "#access");
}

/** A forwarded or leaked private link: replace it, and the old one stops working. */
async function newLink(formData) {
  "use server";
  await requireStaffManager();
  const id = Number(formData.get("id"));
  rotateVendorToken(id);
  logActivity({ eventType: "vendor_updated", description: `Replaced the private link for maker #${id}`, ...(await getActor()) });
  back(id, "New private link made — the old one no longer works.", "success", "#access");
}

export default async function VendorPage({ params }) {
  await requireAdmin();
  const me = await getCurrentUser();
  const vendor = getVendor(Number(params.id));
  if (!vendor) notFound();
  const consigned = true;
  const account = vendor.email ? getAccountByEmail(vendor.email) : null;
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

  return (
    <div>
      <p className="mb-2 text-sm">
        <Link href="/admin/vendors" className="font-semibold text-ink-muted hover:text-ink">
          ← Makers
        </Link>
      </p>
      <PageHeader
        title={vendor.name}
        subtitle={
          `Consignment · ${splitFor(null, vendor)}% of each sale goes to them${vendor.payout_method ? ` · paid by ${vendor.payout_method}` : ""}`
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        <Button href={`/admin/inventory/receive?vendor=${vendor.id}`} variant="accent">+ Receive stock from them</Button>
        <Button href={`/admin/inventory?vendor=${vendor.id}&status=all`} variant="ghost">Their items</Button>
        {waitingDropoffs.length ? (
          <Button href={`/admin/inventory/receive?dropoff=${waitingDropoffs[0].id}`} variant="ghost">
            Count in their drop-off ({waitingDropoffs[0].units} items)
          </Button>
        ) : null}
      </div>

      <Card id="access" pad="md" className="mb-6">
        <h2 className="text-base font-semibold text-ink">Their account</h2>
        <ul className="mt-2 space-y-1 text-sm text-ink-soft">
          <li>
            {!vendor.email
              ? "No email on file — add one below so they can make an account."
              : account?.email_verified_at
                ? `Has an account (${vendor.email})${account.last_login_at ? `, last signed in ${formatDateShort(account.last_login_at.slice(0, 10))}` : ""}.`
                : `No account yet. They can make one with ${vendor.email} at ${appUrl}/account/sign-up.`}
          </li>
          <li>
            {needsTerms(vendor)
              ? vendor.terms_accepted_at
                ? "The terms changed since they agreed — they'll be asked again."
                : "Hasn't agreed to the consignment terms yet (they're asked first thing)."
              : `Agreed to the terms ${formatDateShort(vendor.terms_accepted_at.slice(0, 10))} as “${vendor.terms_accepted_name}”.`}
          </li>
        </ul>
        <div className="mt-3 rounded-lg bg-paper-dim p-3">
          <p className="text-sm font-semibold text-ink">Private link (no password needed)</p>
          {link ? (
            <>
              <code className="mt-1 block break-all text-xs text-ink-soft">{link}</code>
              <p className="mt-2 flex flex-wrap gap-3 text-xs">
                {vendor.phone ? (
                  <a href={`sms:${vendor.phone}?&body=${encodeURIComponent(textBody)}`} className="font-semibold text-ink underline">
                    Text it to them
                  </a>
                ) : null}
                <span className="text-ink-muted">Anyone with this link sees their sales — send it only to them.</span>
              </p>
              {canManageStaff(me) ? (
                <form action={newLink} className="mt-2">
                  <input type="hidden" name="id" value={vendor.id} />
                  <button className="text-xs font-semibold text-rust hover:underline">Replace this link (the old one stops working)</button>
                </form>
              ) : null}
            </>
          ) : (
            <form action={makeLink} className="mt-2">
              <input type="hidden" name="id" value={vendor.id} />
              <Button type="submit" size="sm" variant="ghost">Make a private link</Button>
            </form>
          )}
        </div>
      </Card>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Card pad="md">
          <p className="text-2xl font-semibold tabular-nums text-ink">{items.reduce((t, i) => t + i.qty_on_hand, 0)}</p>
          <p className="text-xs text-ink-muted">on the shelf now</p>
        </Card>
        <Card pad="md">
          <p className="text-2xl font-semibold tabular-nums text-ink">{soldUnits}</p>
          <p className="text-xs text-ink-muted">sold · {formatMoney(soldNet)} after discounts</p>
        </Card>
        {consigned ? (
          <Card pad="md" className={balance.owed ? "border-verde-deep/40" : ""}>
            <p className="text-2xl font-semibold tabular-nums text-ink">{formatMoney(dueNow)}</p>
            <p className="text-xs text-ink-muted">
              due now, for sales through {formatDateShort(cutoff)}
              {balance.owed > dueNow ? ` · ${formatMoney(balance.owed - dueNow)} more this month, paid next month` : ""}
            </p>
          </Card>
        ) : null}
      </div>

      {consigned ? (
        <Card id="payouts" pad="md" className="mb-6">
          <h2 className="text-base font-semibold text-ink">Pay them</h2>
          <p className="mt-1 text-xs text-ink-muted">
            Monthly: early each month, pay them for everything sold the month before. Unpaid sales so far:
          </p>
          {unpaid.length ? (
            <>
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-muted">
                    <th className="py-1.5 pr-2">Sold</th>
                    <th className="py-1.5 pr-2">Item</th>
                    <th className="py-1.5 pr-2 text-right">Qty</th>
                    <th className="py-1.5 pr-2 text-right">Sale</th>
                    <th className="py-1.5 text-right">Their share</th>
                  </tr>
                </thead>
                <tbody>
                  {unpaid.map((s) => (
                    <tr key={s.id} className="border-b border-line/60">
                      <td className="py-1.5 pr-2 text-ink-soft">{fmtDay(s.sold_at.slice(0, 10))}</td>
                      <td className="py-1.5 pr-2 text-ink">
                        {s.name}
                        {s.is_return ? <span className="ml-1 text-xs text-rust">(return)</span> : null}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{s.qty}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{formatMoney(s.net)}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatMoney(consignorShare(s))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {canManageStaff(me) ? (
                <form action={pay} className="mt-4 grid gap-3 rounded-lg bg-paper-dim p-3 sm:grid-cols-4">
                  <input type="hidden" name="id" value={vendor.id} />
                  <div>
                    <label className="label">Covers sales up to</label>
                    <input name="through" type="date" defaultValue={cutoff} required className="field" />
                  </div>
                  <div>
                    <label className="label">Paid on</label>
                    <input name="paid_on" type="date" defaultValue={venueToday()} required className="field" />
                  </div>
                  <div>
                    <label className="label">How</label>
                    <input name="method" defaultValue={vendor.payout_method || ""} className="field" placeholder="Venmo, check…" />
                  </div>
                  <div>
                    <label className="label">Check # / note</label>
                    <input name="reference" className="field" />
                  </div>
                  <div className="sm:col-span-4">
                    {vendor.email ? (
                      <label className="mb-2 flex items-center gap-2 text-sm text-ink-soft">
                        <input type="checkbox" name="email_statement" />
                        Also email them the statement (it always goes in their account)
                      </label>
                    ) : null}
                    <Button type="submit">Record payment</Button>
                    <p className="mt-1 text-xs text-ink-muted">
                      Pay them first (Venmo, check…), then record it here. The amount is worked out from the sales above —
                      nothing to type.
                    </p>
                  </div>
                </form>
              ) : (
                <p className="mt-3 text-xs text-ink-muted">An owner or admin records payouts.</p>
              )}
            </>
          ) : (
            <p className="mt-2 text-sm text-ink-muted">Nothing owed — no unpaid sales.</p>
          )}

          {payouts.length ? (
            <>
              <h3 className="mt-6 text-sm font-semibold text-ink">Paid so far</h3>
              <ul className="mt-2 divide-y divide-line text-sm">
                {payouts.map((p) => (
                  <li key={p.id} className="flex flex-wrap gap-x-3 py-2">
                    <span className="font-semibold text-ink">{formatMoney(p.amount)}</span>
                    <span className="text-ink-soft">
                      on {formatDateShort(p.paid_on)} · {p.line_count} sale{p.line_count === 1 ? "" : "s"} through{" "}
                      {formatDateShort(p.through)} ({formatMoney(p.sales_total)} sold)
                    </span>
                    <span className="text-ink-muted">
                      {[p.method, p.reference].filter(Boolean).join(" · ")} · by {p.created_by}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </Card>
      ) : null}

      <Card pad="md" className="mb-6">
        <h2 className="text-base font-semibold text-ink">Stock sheets</h2>
        {intakes.length ? (
          <ul className="mt-2 divide-y divide-line text-sm">
            {intakes.map((s) => (
              <li key={s.id} className="flex flex-wrap gap-2 py-2">
                <Link href={`/admin/inventory/intake/${s.id}`} className="font-semibold text-ink hover:underline">
                  #{s.id} · {formatDateShort(s.received_on)}
                </Link>
                <span className="text-ink-muted">
                  {s.units} item{Math.abs(s.units) === 1 ? "" : "s"}
                  {s.notes ? ` · ${s.notes}` : ""}
                </span>
                {s.square_status !== "synced" ? <Badge tone="danger">not in Square</Badge> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-ink-muted">None yet.</p>
        )}
      </Card>

      <details className="card p-5">
        <summary className="cursor-pointer font-semibold text-ink">Edit details</summary>
        <form action={saveVendor} className="mt-4 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="id" value={vendor.id} />
          <div>
            <label className="label">Name</label>
            <input name="name" defaultValue={vendor.name} className="field" />
          </div>
          <div>
            <label className="label">Contact person</label>
            <input name="contact_name" defaultValue={vendor.contact_name || ""} className="field" />
          </div>
          <div>
            <label className="label">Their share (%)</label>
            <input name="default_split" defaultValue={vendor.default_split ?? ""} readOnly={!canManageStaff(me)} inputMode="decimal" className="field" />
          </div>
          <div>
            <label className="label">Email</label>
            <input name="email" defaultValue={vendor.email || ""} readOnly={!canManageStaff(me)} className="field" />
          </div>
          <div>
            <label className="label">Phone</label>
            <input name="phone" defaultValue={vendor.phone || ""} className="field" />
          </div>
          <div>
            <label className="label">How they like to be paid</label>
            <input name="payout_method" defaultValue={vendor.payout_method || ""} readOnly={!canManageStaff(me)} className="field" />
          </div>
          <div>
            <label className="label">Notes</label>
            <input name="notes" defaultValue={vendor.notes || ""} className="field" />
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="submit">Save</Button>
          </div>
          <p className="text-xs text-ink-muted sm:col-span-2">
            Their email is what links them to their account — change it only if they ask.
          </p>
        </form>
        <form action={toggleVendor} className="mt-3">
          <input type="hidden" name="id" value={vendor.id} />
          <input type="hidden" name="active" value={vendor.is_active ? "0" : "1"} />
          <Button type="submit" variant={vendor.is_active ? "danger" : "ghost"} size="sm">
            {vendor.is_active ? "Mark inactive" : "Reactivate"}
          </Button>
        </form>
      </details>
    </div>
  );
}

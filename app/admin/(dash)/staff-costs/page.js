import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActor, requireStaffManager } from "@/lib/auth.js";
import { getSetting, setSetting } from "@/lib/db.js";
import { parseList, notifyList } from "@/lib/notify.js";
import { isSquareConfigured } from "@/lib/square.js";
import { emailTenantStaffShare } from "@/lib/email.js";
import {
  MONTH_RE,
  buildMonth,
  cancelShare,
  getMonth,
  listMonths,
  monthLabel,
  previousMonth,
  refreshPayments,
  refreshShares,
  saveMonthEdits,
  saveSetup,
  sendMonth,
  shareCandidates,
  staffCostSettings,
} from "@/lib/staff-costs.js";
import { formatMoney } from "@/lib/constants.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import Card from "@/components/admin/ui/Card.js";
import Button from "@/components/admin/ui/Button.js";
import Badge from "@/components/admin/ui/Badge.js";
import ConfirmButton from "@/components/admin/ui/ConfirmButton.js";

export const metadata = { title: "Shared staff cost" };
export const dynamic = "force-dynamic";

const PATH = "/admin/staff-costs";

function back(month, message, type = "success") {
  const p = new URLSearchParams();
  if (month) p.set("month", month);
  if (message) {
    p.set("toast", message);
    p.set("toastType", type);
  }
  revalidatePath(PATH);
  redirect(`${PATH}?${p}`);
}

const monthOf = (formData) => {
  const m = String(formData.get("month") || "");
  return MONTH_RE.test(m) ? m : null;
};

async function build(formData) {
  "use server";
  await requireStaffManager();
  const month = monthOf(formData);
  let msg;
  try {
    const m = await buildMonth(month);
    msg = `Built ${monthLabel(month)} from Square — ${formatMoney(m.total)}.`;
  } catch (err) {
    back(month, err.message, "error");
  }
  back(month, msg);
}

async function saveEdits(formData) {
  "use server";
  await requireStaffManager();
  const month = monthOf(formData);
  try {
    saveMonthEdits(month, {
      adjustment: formData.get("adjustment"),
      overrideTotal: formData.get("override_total"),
      note: formData.get("note"),
    });
  } catch (err) {
    back(month, err.message, "error");
  }
  back(month, "Saved — shares updated.");
}

async function send(formData) {
  "use server";
  await requireStaffManager();
  const month = monthOf(formData);
  const { actorName } = await getActor();
  let r;
  try {
    r = await sendMonth(month, { by: actorName, email: emailTenantStaffShare });
  } catch (err) {
    back(month, err.message, "error");
  }
  back(
    month,
    r.failed ? `Sent ${r.sent}; ${r.failed} didn't go — see the red note on each.` : `Sent ${r.sent} bill${r.sent === 1 ? "" : "s"}.`,
    r.failed ? "error" : "success"
  );
}

async function cancel(formData) {
  "use server";
  await requireStaffManager();
  const month = monthOf(formData);
  try {
    await cancelShare(Number(formData.get("share")));
  } catch (err) {
    back(month, err.message, "error");
  }
  back(month, "Cancelled in Square. Send again to bill a fresh invoice.", "neutral");
}

async function checkPayments(formData) {
  "use server";
  await requireStaffManager();
  const month = monthOf(formData);
  let r;
  try {
    r = await refreshPayments();
  } catch (err) {
    back(month, err.message, "error");
  }
  back(month, r.paid ? `${r.paid} newly paid.` : "No new payments yet.", "neutral");
}

async function setup(formData) {
  "use server";
  await requireStaffManager();
  const month = monthOf(formData);
  const billingEmails = {};
  for (const [k, v] of formData.entries()) {
    if (k.startsWith("billing_")) billingEmails[k.slice(8)] = v;
  }
  const notify = String(formData.get("notify") || "").trim();
  try {
    if (notify && !parseList(notify).length) throw new Error("“Send the monthly draft to” needs an email address.");
    saveSetup({
      payers: formData.getAll("payer"),
      billingEmails,
      taxPct: formData.get("tax_pct"),
      monthlyFees: formData.get("monthly_fees"),
    });
    setSetting("staff_cost_notify", parseList(notify).join(", "));
    // An unsent month picks up the new payers right away.
    if (month) refreshShares(month);
  } catch (err) {
    back(month, err.message, "error");
  }
  back(month, "Saved. Rebuild a month to use new tax or fee figures.");
}

const STATUS = {
  draft: ["neutral", "Not sent"],
  sent: ["warning", "Sent — unpaid"],
  paid: ["success", "Paid"],
  failed: ["danger", "Didn't send"],
  cancelled: ["ink", "Cancelled"],
};

function Line({ label, value, strong, hint }) {
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

export default async function StaffCostsPage({ searchParams }) {
  await requireStaffManager();
  const month = MONTH_RE.test(searchParams?.month || "") ? searchParams.month : previousMonth();
  const m = getMonth(month);
  const months = listMonths();
  if (!months.some((x) => x.month === month)) months.unshift({ month, total: null });
  const candidates = shareCandidates();
  const settings = staffCostSettings();
  const notifySetting = getSetting("staff_cost_notify", "");
  const toBill = m ? m.shares.filter((s) => s.directory_id != null && ["draft", "failed", "cancelled"].includes(s.status)) : [];
  const outstanding = m ? m.shares.filter((s) => s.status === "sent") : [];
  const estimate = m ? m.wages + m.taxes + m.fees + m.adjustment : 0;

  return (
    <div>
      <PageHeader
        eyebrow="Shop"
        title="Shared staff cost"
        subtitle="The tenants and the shop split what the staff cost each month, evenly. On the 1st the site adds up last month from Square's timecards and emails you; nothing goes to a tenant until you press Send. Each tenant then gets a Square invoice, due with rent."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {months.slice(0, 12).map((x) => (
          <Button key={x.month} href={`${PATH}?month=${x.month}`} size="sm" variant={x.month === month ? "primary" : "ghost"}>
            {monthLabel(x.month)}
            {x.total != null ? <span className="font-normal opacity-70">· {formatMoney(x.total)}</span> : null}
          </Button>
        ))}
        <form className="flex items-center gap-1">
          <input name="month" type="month" defaultValue={month} className="field !h-8 !w-auto !py-0 text-xs" aria-label="Another month" />
          <Button type="submit" size="sm" variant="ghost">Go</Button>
        </form>
      </div>

      {!isSquareConfigured() ? (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Square isn&apos;t connected on this copy of the site — timecards come back empty and invoices are only pretend.
        </p>
      ) : null}

      {!m ? (
        <Card>
          <p className="text-sm text-ink">{monthLabel(month)} hasn&apos;t been added up yet.</p>
          <form action={build} className="mt-3">
            <input type="hidden" name="month" value={month} />
            <Button type="submit">Add it up from Square timecards</Button>
          </form>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-semibold text-ink">How {monthLabel(month)} adds up</h2>
              {!m.locked ? (
                <form action={build}>
                  <input type="hidden" name="month" value={month} />
                  <Button type="submit" size="sm" variant="ghost">Rebuild from Square</Button>
                </form>
              ) : null}
            </div>

            {m.detail.people?.length ? (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-ink-muted">
                      <th className="py-1 pr-2 font-medium">Who</th>
                      <th className="py-1 pr-2 text-right font-medium">Hours</th>
                      <th className="py-1 pr-2 text-right font-medium">Overtime</th>
                      <th className="py-1 pr-2 text-right font-medium">Rate</th>
                      <th className="py-1 text-right font-medium">Wages</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.detail.people.map((p) => (
                      <tr key={p.id} className="border-b border-line/60">
                        <td className="py-1.5 pr-2 text-ink">{p.name}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{p.hours}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{p.otHours || "—"}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{p.rate != null ? formatMoney(p.rate) : <span className="text-rust">none</span>}</td>
                        <td className="py-1.5 text-right tabular-nums">{formatMoney(p.wages)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-2 text-sm text-ink-muted">No timecards in Square for this month.</p>
            )}

            {m.detail.warnings?.length ? (
              <ul className="mt-3 space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {m.detail.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}

            <div className="mt-3">
              <Line label={`Wages · ${m.hours} hours`} value={m.wages} hint={m.ot_hours ? `${m.ot_hours} hours overtime at 1½×` : null} />
              <Line label={`Employer payroll taxes · ${m.tax_pct}%`} value={m.taxes} />
              <Line label="Payroll fees and other monthly costs" value={m.fees} />
              {m.adjustment ? <Line label="Adjustment" value={m.adjustment} hint={m.note} /> : null}
              {m.override_total != null ? (
                <>
                  <Line label="Our estimate" value={estimate} />
                  <Line label="Square Payroll's total (used)" value={m.override_total} hint={!m.adjustment ? m.note : null} />
                </>
              ) : null}
              <Line label="Staff cost for the month" value={m.total} strong />
            </div>

            {!m.locked ? (
              <form action={saveEdits} className="mt-4 space-y-3 border-t border-line pt-4">
                <input type="hidden" name="month" value={month} />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="min-w-0">
                    <label className="label" htmlFor="adjustment">Adjustment (+ or −)</label>
                    <input id="adjustment" name="adjustment" inputMode="decimal" defaultValue={m.adjustment || ""} placeholder="0.00" className="field" />
                  </div>
                  <div className="min-w-0">
                    <label className="label" htmlFor="override_total">Square Payroll&apos;s total (optional)</label>
                    <input id="override_total" name="override_total" inputMode="decimal" defaultValue={m.override_total ?? ""} placeholder="Use the estimate" className="field" />
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="note">Note (for you)</label>
                  <input id="note" name="note" defaultValue={m.note || ""} className="field" />
                </div>
                <p className="text-xs text-ink-muted">
                  For the exact figure, use the total employer cost on Square Payroll&apos;s payroll report for the month
                  (wages + employer taxes + fees). Blank uses the estimate above.
                </p>
                <Button type="submit" variant="ghost">Save</Button>
              </form>
            ) : (
              <p className="mt-3 text-xs text-ink-muted">Bills have gone out, so this month is locked. Cancel them all to change it.</p>
            )}
          </Card>

          <Card>
            <h2 className="font-semibold text-ink">Who pays what</h2>
            <ul className="mt-3 divide-y divide-line/60">
              {m.shares.map((s) => {
                const [tone, label] = s.directory_id == null ? ["sage", "The shop's share"] : STATUS[s.status] || STATUS.draft;
                return (
                  <li key={s.id} className="py-2.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 text-sm">
                        <span className="font-semibold text-ink">{s.name}</span>
                        {s.directory_id != null ? <span className="block break-all text-xs text-ink-muted">{s.email || "no email"}</span> : null}
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block font-semibold tabular-nums text-ink">{formatMoney(s.amount)}</span>
                        <Badge tone={tone}>{label}</Badge>
                      </span>
                    </div>
                    {s.error ? <p className="mt-1 text-xs text-rust">{s.error}</p> : null}
                    {s.status === "sent" ? (
                      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs">
                        {s.payment_link ? (
                          <a href={s.payment_link} target="_blank" rel="noreferrer" className="font-semibold text-verde-deep underline">
                            Their invoice
                          </a>
                        ) : null}
                        <form action={cancel}>
                          <input type="hidden" name="month" value={month} />
                          <input type="hidden" name="share" value={s.id} />
                          <button type="submit" className="text-ink-muted underline hover:text-rust">Cancel this bill</button>
                        </form>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
              {toBill.length ? (
                <form action={send}>
                  <input type="hidden" name="month" value={month} />
                  <ConfirmButton
                    label={`Send ${toBill.length} bill${toBill.length === 1 ? "" : "s"}`}
                    question={`Bill ${toBill.map((s) => `${s.name} ${formatMoney(s.amount)}`).join(", ")}? Each gets a Square invoice due today and an email with the link.`}
                    confirmLabel="Yes, send them"
                    pendingLabel="Sending…"
                  />
                </form>
              ) : null}
              {outstanding.length ? (
                <form action={checkPayments}>
                  <input type="hidden" name="month" value={month} />
                  <Button type="submit" variant="ghost">Check for payments</Button>
                </form>
              ) : null}
              {!toBill.length && !outstanding.length && m.shares.some((s) => s.status === "paid") ? (
                <p className="text-sm text-ink-muted">All paid.</p>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-ink-muted">Payments are also checked every night.</p>
          </Card>
        </div>
      )}

      <details className="card mt-4 p-5">
        <summary className="cursor-pointer font-semibold text-ink">Who pays, and the cost settings</summary>
        <form action={setup} className="mt-4 space-y-4">
          <input type="hidden" name="month" value={month} />
          <div>
            <p className="label">Tenants who pay a share</p>
            <p className="mb-2 text-xs text-ink-muted">
              The cost is split evenly between everyone ticked here plus the shop. Bills go to the billing email, or their
              directory contact email when that&apos;s blank. Everyone ticked also sees who&apos;s working this week and next on
              their account page, read from the schedule published in Square (first names and times only).
            </p>
            <ul className="space-y-2">
              {candidates.map((c) => (
                <li key={c.id} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_16rem]">
                  <label className="flex min-w-0 items-center gap-2 text-sm text-ink">
                    <input type="checkbox" name="payer" value={c.id} defaultChecked={!!c.shares_staff_cost} />
                    <span className="truncate">
                      {c.business_name}
                      {c.is_tenant ? <span className="ml-1 text-xs text-ink-muted">· tenant</span> : null}
                    </span>
                  </label>
                  <input
                    name={`billing_${c.id}`}
                    type="email"
                    defaultValue={c.billing_email || ""}
                    placeholder={c.contact_email || "billing email"}
                    className="field !h-8 text-xs"
                    aria-label={`Billing email for ${c.business_name}`}
                  />
                </li>
              ))}
            </ul>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="min-w-0">
              <label className="label" htmlFor="tax_pct">Employer payroll taxes (%)</label>
              <input id="tax_pct" name="tax_pct" inputMode="decimal" defaultValue={settings.taxPct} className="field" />
              <p className="mt-1 text-xs text-ink-muted">7.65% is Social Security + Medicare. Add your unemployment rates (federal 0.6% + Utah&apos;s rate for you).</p>
            </div>
            <div className="min-w-0">
              <label className="label" htmlFor="monthly_fees">Payroll fees per month ($)</label>
              <input id="monthly_fees" name="monthly_fees" inputMode="decimal" defaultValue={settings.monthlyFees} className="field" />
              <p className="mt-1 text-xs text-ink-muted">Square Payroll&apos;s monthly fee, workers&apos; comp, and the like.</p>
            </div>
            <div className="min-w-0">
              <label className="label" htmlFor="notify">Send the monthly draft to</label>
              <input id="notify" name="notify" defaultValue={notifySetting} placeholder={notifyList("staff_cost_notify").join(", ")} className="field" />
              <p className="mt-1 text-xs text-ink-muted">The bookkeeper. Separate several with commas.</p>
            </div>
          </div>
          <Button type="submit">Save</Button>
        </form>
      </details>

      <p className="mt-4 text-xs text-ink-muted">
        Tenants&apos; payments show on <Link href="/admin/sales" className="underline">Sales</Link> as “tenant&apos;s staff share” and are kept out of the sales-tax numbers.
      </p>
    </div>
  );
}

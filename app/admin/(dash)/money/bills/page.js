import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaffManager } from "@/lib/auth.js";
import {
  CATEGORIES,
  MONTH_RE,
  billShare,
  billsFor,
  cancelShareBill,
  listAccounts,
  markShareBillPaid,
  monthLabel,
  saveAccount,
  saveBill,
  shareLabel,
  sharesFor,
  thisMonth,
} from "@/lib/money.js";
import { emailShareBill } from "@/lib/email.js";
import { formatDateShort, formatMoney, shiftDate, venueToday } from "@/lib/constants.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import Card from "@/components/admin/ui/Card.js";
import Button from "@/components/admin/ui/Button.js";
import Badge from "@/components/admin/ui/Badge.js";
import ConfirmButton from "@/components/admin/ui/ConfirmButton.js";

export const metadata = { title: "Bills" };
export const dynamic = "force-dynamic";

const PATH = "/admin/money/bills";
const back = (month, msg, type = "success") => {
  revalidatePath(PATH);
  revalidatePath("/admin/money");
  redirect(`${PATH}?month=${month}${msg ? `&toast=${encodeURIComponent(msg)}&toastType=${type}` : ""}`);
};
const monthOf = (fd) => (MONTH_RE.test(String(fd.get("month") || "")) ? String(fd.get("month")) : thisMonth());

async function save(formData) {
  "use server";
  await requireStaffManager();
  const month = monthOf(formData);
  try {
    saveBill(formData.get("id"), {
      amount: formData.get("amount"),
      paidOn: formData.get("paid") ? formData.get("paid_on") || venueToday() : null,
      note: formData.get("note"),
    });
  } catch (err) {
    back(month, err.message, "error");
  }
  back(month, "Saved.");
}

async function sendShare(formData) {
  "use server";
  await requireStaffManager();
  const month = monthOf(formData);
  const name = String(formData.get("name") || "");
  try {
    await billShare(month, name, { email: emailShareBill });
  } catch (err) {
    back(month, err.message, "error");
  }
  back(month, `Sent ${name} their bill for ${monthLabel(month)}.`);
}

async function cancelShare(formData) {
  "use server";
  await requireStaffManager();
  const month = monthOf(formData);
  try {
    await cancelShareBill(formData.get("id"));
  } catch (err) {
    back(month, err.message, "error");
  }
  back(month, "Cancelled. Send again to bill a fresh invoice.", "neutral");
}

async function sharePaid(formData) {
  "use server";
  await requireStaffManager();
  const month = monthOf(formData);
  markShareBillPaid(formData.get("id"));
  back(month, "Marked paid.");
}

async function saveSetup(formData) {
  "use server";
  await requireStaffManager();
  const month = monthOf(formData);
  try {
    saveAccount({
      id: formData.get("id") || null,
      name: formData.get("name"),
      category: formData.get("category"),
      typical_amount: formData.get("typical_amount"),
      due_day: formData.get("due_day"),
      share_pct: formData.get("share_pct"),
      share_name: formData.get("share_name"),
      share_email: formData.get("share_email"),
      is_active: formData.get("id") ? formData.get("is_active") != null : true,
    });
  } catch (err) {
    back(month, err.message, "error");
  }
  back(month, formData.get("id") ? "Bill updated." : "Bill added — it shows up every month from now on.");
}

function AccountFields({ a = {}, month }) {
  return (
    <>
      <input type="hidden" name="month" value={month} />
      {a.id ? <input type="hidden" name="id" value={a.id} /> : null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1.4fr_1fr_0.8fr_0.6fr]">
        <div className="col-span-2 min-w-0 sm:col-span-1">
          <label className="label">Name</label>
          <input name="name" required defaultValue={a.name || ""} placeholder="Power — Rocky Mountain Power" className="field" />
        </div>
        <div className="min-w-0">
          <label className="label">Kind</label>
          <select name="category" defaultValue={a.category || "utility"} className="field">
            {Object.entries(CATEGORIES).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label className="label">Usual $</label>
          <input name="typical_amount" inputMode="decimal" defaultValue={a.typical_amount ?? ""} placeholder="varies" className="field" />
        </div>
        <div className="min-w-0">
          <label className="label">Due day</label>
          <input name="due_day" type="number" min="1" max="31" defaultValue={a.due_day ?? ""} className="field" />
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-[0.6fr_1fr_1.4fr]">
        <div className="min-w-0">
          <label className="label">Their share</label>
          <input name="share_pct" defaultValue={a.share_pct ? shareLabel(a.share_pct) : ""} placeholder="1/3, 50% or 100%" className="field" />
        </div>
        <div className="min-w-0">
          <label className="label">Who pays it</label>
          <input name="share_name" defaultValue={a.share_name || ""} placeholder="Jay" className="field" />
        </div>
        <div className="col-span-2 min-w-0 sm:col-span-1">
          <label className="label">Their email (for the bill)</label>
          <input name="share_email" type="email" defaultValue={a.share_email || ""} placeholder="jay@example.com" className="field" />
        </div>
      </div>
    </>
  );
}

export default async function BillsPage({ searchParams }) {
  await requireStaffManager();
  const month = MONTH_RE.test(searchParams?.month || "") ? searchParams.month : thisMonth();
  const bills = billsFor(month);
  const shares = sharesFor(month);
  const accounts = listAccounts();
  const prev = shiftDate(`${month}-01`, { months: -1 }).slice(0, 7);
  const next = shiftDate(`${month}-01`, { months: 1 }).slice(0, 7);
  const today = venueToday();
  const entered = bills.filter((b) => b.amount != null);
  const total = entered.reduce((t, b) => t + b.amount, 0);
  const unpaid = entered.filter((b) => !b.paid_on).reduce((t, b) => t + b.amount, 0);

  return (
    <div>
      <PageHeader
        eyebrow="Money"
        title={`Bills · ${monthLabel(month)}`}
        subtitle="The building's own bills. Type each amount when the bill comes in and tick it once it's paid. Anything with a co-payer (Jay's third of the utilities) adds up below, ready to send as one bill."
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button href={`${PATH}?month=${prev}`} variant="ghost" size="sm">← {monthLabel(prev)}</Button>
        <Button href={`${PATH}?month=${next}`} variant="ghost" size="sm">{monthLabel(next)} →</Button>
        <Button href={`/admin/money?month=${month}`} variant="subtle" size="sm">Back to Money</Button>
        <span className="ml-auto text-sm text-ink-muted">
          {formatMoney(total)} this month · <span className={unpaid ? "font-semibold text-rust" : ""}>{formatMoney(unpaid)} unpaid</span>
        </span>
      </div>

      <Card pad="sm">
        <ul className="divide-y divide-line">
          {bills.map((b) => {
            const late = !b.paid_on && b.amount > 0 && b.due_date && b.due_date < today;
            return (
              <li key={b.id} className="px-2 py-3">
                <form action={save} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[1.6fr_0.9fr_1.4fr_1.2fr_auto]">
                  <input type="hidden" name="month" value={month} />
                  <input type="hidden" name="id" value={b.id} />
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{b.name}</p>
                    <p className="text-xs text-ink-muted">
                      {CATEGORIES[b.category] || b.category}
                      {b.due_date ? ` · due ${formatDateShort(b.due_date)}` : ""}
                      {b.share_pct ? ` · ${b.share_name} pays ${shareLabel(b.share_pct)}${b.share ? ` (${formatMoney(b.share)})` : ""}` : ""}
                    </p>
                    {late ? <Badge tone="danger">past due</Badge> : null}
                  </div>
                  <div className="min-w-0">
                    <label className="label text-xs">Amount</label>
                    <input name="amount" inputMode="decimal" defaultValue={b.amount ?? ""} placeholder={b.typical_amount ? String(b.typical_amount) : "0.00"} className="field" />
                  </div>
                  <div className="min-w-0">
                    <label className="label text-xs">Note</label>
                    <input name="note" defaultValue={b.note || ""} placeholder="account #, confirmation…" className="field" />
                  </div>
                  <div className="min-w-0">
                    <label className="flex items-center gap-2 text-sm text-ink-soft">
                      <input type="checkbox" name="paid" defaultChecked={!!b.paid_on} /> Paid on
                    </label>
                    <input name="paid_on" type="date" defaultValue={b.paid_on || today} className="field mt-1" />
                  </div>
                  <Button type="submit" variant="ghost" size="sm">Save</Button>
                </form>
              </li>
            );
          })}
        </ul>
      </Card>

      {shares.length ? (
        <>
          <h2 className="mb-2 mt-6 text-lg font-semibold text-ink">Co-payers&apos; share</h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {shares.map((p) => {
              const st = p.bill?.status;
              return (
                <Card pad="md" key={p.name}>
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="font-semibold text-ink">{p.name}</h3>
                    <span className="text-xl font-semibold tabular-nums text-ink">{formatMoney(p.amount)}</span>
                  </div>
                  <ul className="mt-2 space-y-0.5 text-sm text-ink-soft">
                    {p.items.map((i) => (
                      <li key={i.name} className="flex justify-between gap-2">
                        <span>{i.name} · {formatMoney(i.bill)} × {shareLabel(i.pct)}</span>
                        <span className="tabular-nums">{formatMoney(i.share)}</span>
                      </li>
                    ))}
                  </ul>
                  {p.missing.length ? (
                    <p className="mt-2 text-xs text-rust">Still to enter: {p.missing.join(", ")}.</p>
                  ) : null}
                  {!p.email ? (
                    <p className="mt-2 text-xs text-rust">Add {p.name}&apos;s email in the bill settings below to send a bill.</p>
                  ) : null}
                  {p.bill?.error ? <p className="mt-2 text-xs text-rust">{p.bill.error}</p> : null}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {st === "paid" ? (
                      <Badge tone="success">paid {p.bill.paid_at ? formatDateShort(p.bill.paid_at.slice(0, 10)) : ""}</Badge>
                    ) : st === "sent" ? (
                      <>
                        <Badge tone="warning">sent — unpaid</Badge>
                        {p.bill.payment_link ? (
                          <a href={p.bill.payment_link} target="_blank" rel="noreferrer" className="text-sm font-semibold text-verde-deep underline">Their invoice</a>
                        ) : null}
                        <form action={sharePaid}>
                          <input type="hidden" name="month" value={month} />
                          <input type="hidden" name="id" value={p.bill.id} />
                          <Button type="submit" size="sm" variant="subtle">Mark paid</Button>
                        </form>
                        <form action={cancelShare}>
                          <input type="hidden" name="month" value={month} />
                          <input type="hidden" name="id" value={p.bill.id} />
                          <button className="text-xs text-ink-muted underline hover:text-rust">Cancel bill</button>
                        </form>
                      </>
                    ) : (
                      <form action={sendShare}>
                        <input type="hidden" name="month" value={month} />
                        <input type="hidden" name="name" value={p.name} />
                        <ConfirmButton
                          label={`Send ${p.name} the bill`}
                          question={`Email ${p.name} a Square invoice for ${formatMoney(p.amount)} — their share of ${monthLabel(month)}'s bills — due in 14 days?`}
                          confirmLabel="Yes, send it"
                          pendingLabel="Sending…"
                          disabled={!p.email || !(p.amount > 0)}
                          disabledLabel={`Send ${p.name} the bill`}
                        />
                      </form>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      ) : null}

      <details className="card mt-6 p-5">
        <summary className="cursor-pointer font-semibold text-ink">The bills we track (add, change, or stop one)</summary>
        <p className="mt-2 text-sm text-ink-muted">
          Each one appears every month. “Their share” sends that part to a co-payer — type 1/3, 50% or 100%. Jay pays a third of
          most building bills and all of the basement gas meter.
        </p>
        <div className="mt-4 space-y-4">
          {accounts.map((a) => (
            <form key={a.id} action={saveSetup} className={`rounded-xl border border-line p-3 ${a.is_active ? "" : "opacity-60"}`}>
              <AccountFields a={a} month={month} />
              <div className="mt-2 flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-ink-soft">
                  <input type="checkbox" name="is_active" defaultChecked={!!a.is_active} /> Still a monthly bill
                </label>
                <Button type="submit" size="sm" variant="ghost">Save</Button>
              </div>
            </form>
          ))}
          <form action={saveSetup} className="rounded-xl border border-dashed border-line-strong p-3">
            <p className="mb-2 text-sm font-semibold text-ink">Add a bill</p>
            <AccountFields month={month} />
            <div className="mt-2">
              <Button type="submit" size="sm" variant="accent">Add</Button>
            </div>
          </form>
        </div>
        <p className="mt-3 text-xs text-ink-muted">
          Rent tenants pay you is under <Link href="/admin/money#rent" className="underline">Money → Rent</Link>; staff cost is on{" "}
          <Link href="/admin/staff-costs" className="underline">Shared staff cost</Link>.
        </p>
      </details>
    </div>
  );
}

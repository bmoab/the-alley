import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaffManager, getActor } from "@/lib/auth.js";
import { MONTH_RE, monthLabel, thisMonth, listAccounts } from "@/lib/money.js";
import {
  BANK_CATEGORIES,
  bankMonth,
  deleteRule,
  importBankFile,
  listBankAccounts,
  listRules,
  payeeKey,
  recentImports,
  setBalance,
  sortLines,
  undoImport,
  unsortedLines,
} from "@/lib/bank.js";
import { formatDateShort, formatMoney, shiftDate } from "@/lib/constants.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import Card from "@/components/admin/ui/Card.js";
import Button from "@/components/admin/ui/Button.js";
import Badge from "@/components/admin/ui/Badge.js";
import Select from "@/components/admin/ui/Select.js";
import ConfirmButton from "@/components/admin/ui/ConfirmButton.js";
import PendingButton from "@/components/admin/ui/PendingButton.js";

export const metadata = { title: "Bank" };
export const dynamic = "force-dynamic";

const PATH = "/admin/money/bank";
const MAX_BYTES = 4 * 1024 * 1024;
const monthOf = (fd) => (MONTH_RE.test(String(fd.get("month") || "")) ? String(fd.get("month")) : thisMonth());
const back = (month, msg, type = "success", hash = "") => {
  revalidatePath(PATH);
  revalidatePath("/admin/money");
  revalidatePath("/admin/money/bills");
  redirect(`${PATH}?month=${month}${msg ? `&toast=${encodeURIComponent(msg)}&toastType=${type}` : ""}${hash}`);
};
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

async function upload(formData) {
  "use server";
  await requireStaffManager();
  const { actorName } = await getActor();
  let month = monthOf(formData);
  const file = formData.get("file");
  let msg;
  try {
    if (!file || typeof file === "string" || !file.size) throw new Error("Choose the file you downloaded from the bank.");
    if (file.size > MAX_BYTES) throw new Error("That file is too big — download a shorter date range (a few months at a time).");
    const acct = String(formData.get("account") || "");
    const r = importBankFile({
      text: await file.text(),
      filename: file.name,
      accountId: /^\d+$/.test(acct) ? Number(acct) : null,
      newName: formData.get("new_name"),
      flip: formData.get("flip") === "1",
      by: actorName,
    });
    month = r.to.slice(0, 7);
    msg = [
      `${r.account.name}: ${plural(r.added, "new line")} (${formatDateShort(r.from)} – ${formatDateShort(r.to)})`,
      r.skipped ? `${r.skipped} already in` : "",
      r.autoSorted ? `${r.autoSorted} sorted automatically` : "",
      r.filled.length ? `filled ${r.filled.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
  } catch (err) {
    back(month, err.message, "error");
  }
  back(month, msg);
}

async function sortAction(formData) {
  "use server";
  await requireStaffManager();
  const { actorName } = await getActor();
  const month = monthOf(formData);
  const ids = formData.getAll("line");
  const changes = ids.map((id) => ({
    id,
    value: String(formData.get(`c_${id}`) || ""),
    remember: formData.get(`r_${id}`) === "1",
  }));
  let r;
  try {
    r = sortLines(changes.filter((c) => c.value || formData.get(`o_${c.id}`)), { by: actorName });
  } catch (err) {
    back(month, err.message, "error");
  }
  const parts = [
    r.changed ? `Sorted ${plural(r.changed, "line")}` : "Nothing changed",
    r.remembered ? `remembered ${plural(r.remembered, "payee")}` : "",
    r.filled.length ? `filled ${r.filled.join(", ")}` : "",
  ].filter(Boolean);
  back(month, parts.join(" · "), r.changed || r.remembered ? "success" : "neutral");
}

async function undoUpload(formData) {
  "use server";
  await requireStaffManager();
  const month = monthOf(formData);
  let n;
  try {
    n = undoImport(formData.get("id"));
  } catch (err) {
    back(month, err.message, "error");
  }
  back(month, `Took that upload back out (${plural(n, "line")}).`, "neutral");
}

async function removeRule(formData) {
  "use server";
  await requireStaffManager();
  deleteRule(formData.get("id"));
  back(monthOf(formData), "Forgot that payee. Lines already sorted stay as they are.", "neutral");
}

async function saveBalance(formData) {
  "use server";
  await requireStaffManager();
  const month = monthOf(formData);
  try {
    setBalance(formData.get("id"), { balance: formData.get("balance"), on: formData.get("on") });
  } catch (err) {
    back(month, err.message, "error");
  }
  back(month, "Balance saved.");
}

/** The category picker for one line: money-out choices for a payment, money-in for a deposit. */
function Choice({ t, bills }) {
  const out = t.amount < 0;
  const cats = Object.entries(BANK_CATEGORIES).filter(([, c]) => c.dir === "both" || c.dir === (out ? "out" : "in"));
  const value = t.category === "bill" ? `bill:${t.expense_account_id}` : t.category || "";
  return (
    <Select name={`c_${t.id}`} defaultValue={value} aria-label={`What was ${t.description}?`}>
      <option value="">Not sorted yet</option>
      {out ? (
        <optgroup label="A bill on the Bills page">
          {bills.map((a) => (
            <option key={a.id} value={`bill:${a.id}`}>
              {a.name}
            </option>
          ))}
        </optgroup>
      ) : null}
      <optgroup label={out ? "Other money out" : "Money in"}>
        {cats.map(([k, c]) => (
          <option key={k} value={k}>
            {c.label}
          </option>
        ))}
      </optgroup>
    </Select>
  );
}

function Amount({ n }) {
  return <span className={`font-semibold tabular-nums ${n > 0 ? "text-verde-deep" : "text-ink"}`}>{n > 0 ? `+${formatMoney(n)}` : formatMoney(n)}</span>;
}

function LineRow({ t, bills, showAccount }) {
  const key = payeeKey(t.description);
  return (
    <li className="grid grid-cols-1 gap-2 py-3 sm:grid-cols-[1fr_16rem] sm:items-center sm:gap-4">
      <input type="hidden" name="line" value={t.id} />
      {t.category ? <input type="hidden" name={`o_${t.id}`} value="1" /> : null}
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 break-words text-sm font-medium text-ink">{t.description}</p>
          <Amount n={t.amount} />
        </div>
        <p className="mt-0.5 text-xs text-ink-muted">
          {formatDateShort(t.posted)}
          {showAccount ? ` · ${t.account_name}` : ""}
          {t.auto ? <span className="text-verde-deep"> · sorted automatically</span> : null}
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <Choice t={t} bills={bills} />
        <label className="flex items-center gap-1.5 text-xs text-ink-soft">
          <input type="checkbox" name={`r_${t.id}`} value="1" />
          Always for “{key}”
        </label>
      </div>
    </li>
  );
}

export default async function BankPage({ searchParams }) {
  await requireStaffManager();
  const month = MONTH_RE.test(searchParams?.month || "") ? searchParams.month : thisMonth();
  const prev = shiftDate(`${month}-01`, { months: -1 }).slice(0, 7);
  const next = shiftDate(`${month}-01`, { months: 1 }).slice(0, 7);
  const accounts = listBankAccounts();
  const bills = listAccounts({ activeOnly: true });
  const todo = unsortedLines();
  const m = bankMonth(month);
  const sorted = m.lines.filter((t) => t.category);
  const imports = recentImports();
  const rules = listRules();
  const showAccount = accounts.length > 1;
  const counted = m.groups.filter((g) => g.counts);

  return (
    <div>
      <PageHeader
        title="Bank"
        subtitle="Upload the statement you download from online banking, then sort each line once. Payments to a tracked bill fill in that bill, and supplies and other spending show on the Money page. Nothing connects to the bank — the site only sees the files you upload."
        actions={
          <Button href={`/admin/money?month=${month}`} size="sm" variant="ghost">
            ← Money
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_1fr]">
        <Card pad="md">
          <h2 className="text-base font-semibold text-ink">Upload a statement</h2>
          {/* Keyed so the form starts empty again after each upload. */}
          <form action={upload} className="mt-3 space-y-3" key={`up-${imports[0]?.id || 0}`}>
            <input type="hidden" name="month" value={month} />
            <div>
              <label className="label" htmlFor="bank-file">File from the bank</label>
              <input
                id="bank-file"
                name="file"
                type="file"
                required
                accept=".csv,.ofx,.qfx,.qbo,text/csv,application/x-ofx"
                className="block w-full text-sm text-ink-soft file:mr-3 file:rounded-lg file:border file:border-line-strong file:bg-paper file:px-3 file:py-2 file:text-sm file:font-semibold file:text-ink"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {accounts.length ? (
                <div>
                  <label className="label" htmlFor="bank-acct">Which account</label>
                  <Select id="bank-acct" name="account" defaultValue={String(accounts[0].id)} aria-label="Which account">
                    {accounts.map((a) => (
                      <option key={a.id} value={String(a.id)}>
                        {a.name}
                        {a.last4 ? ` ··${a.last4}` : ""}
                      </option>
                    ))}
                    <option value="new">A new account…</option>
                  </Select>
                </div>
              ) : (
                <input type="hidden" name="account" value="new" />
              )}
              <div>
                <label className="label" htmlFor="bank-new">{accounts.length ? "New account's name" : "Account name"}</label>
                <input id="bank-new" name="new_name" placeholder="Checking" className="field" />
                {accounts.length ? <p className="mt-1 text-xs text-ink-muted">Only if you picked “A new account”.</p> : null}
              </div>
            </div>
            <label className="flex items-start gap-2 text-xs text-ink-soft">
              <input type="checkbox" name="flip" value="1" className="mt-0.5" />
              <span>This file shows charges as positive numbers (some credit cards do) — flip them.</span>
            </label>
            <PendingButton label="Upload" pendingLabel="Reading it…" />
          </form>
          <details className="mt-4 text-xs text-ink-muted">
            <summary className="cursor-pointer font-semibold text-ink-soft">How to get the file</summary>
            <p className="mt-2">
              In online banking (on a computer is easiest), open the account and look for <strong>Download</strong> or{" "}
              <strong>Export</strong> transactions. Pick a date range and choose <strong>CSV</strong>, or{" "}
              <strong>Quicken / QuickBooks (QFX, OFX, QBO)</strong> if offered — that one also carries the balance. Upload as often as
              you like: lines already in are skipped, so overlapping dates are fine. Stick to one kind of file per account.
            </p>
          </details>
        </Card>

        <Card pad="md">
          <h2 className="text-base font-semibold text-ink">Accounts</h2>
          {accounts.length ? (
            <ul className="mt-2 divide-y divide-line">
              {accounts.map((a) => (
                <li key={a.id} className="py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium text-ink">
                      {a.name}
                      {a.last4 ? <span className="text-ink-muted"> ··{a.last4}</span> : null}
                    </span>
                    <span className="font-semibold tabular-nums text-ink">{a.balance != null ? formatMoney(a.balance) : "—"}</span>
                  </div>
                  <p className="text-xs text-ink-muted">
                    {a.balance != null ? `Balance on ${formatDateShort(a.balance_on)} · ` : ""}
                    {plural(a.lines, "line")}
                    {a.newest ? ` · through ${formatDateShort(a.newest)}` : ""}
                  </p>
                  <details className="mt-1 text-xs">
                    <summary className="cursor-pointer text-ink-muted underline">Type the balance</summary>
                    <form action={saveBalance} className="mt-2 flex flex-wrap items-center gap-2">
                      <input type="hidden" name="month" value={month} />
                      <input type="hidden" name="id" value={a.id} />
                      <input name="balance" inputMode="decimal" placeholder="0.00" aria-label="Balance" className="field !h-9 !w-32 text-sm" />
                      <input name="on" type="date" aria-label="As of" className="field !h-9 !w-40 text-sm" />
                      <PendingButton label="Save" size="sm" variant="ghost" />
                    </form>
                  </details>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-ink-muted">None yet — your first upload adds the account.</p>
          )}
          {imports.length ? (
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer font-semibold text-ink-soft">Recent uploads</summary>
              <ul className="mt-2 space-y-2">
                {imports.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 text-ink-muted">
                      {i.account_name} · {formatDateShort(i.from_date)} – {formatDateShort(i.to_date)} · {plural(i.added, "new line")}
                      {i.by_name ? ` · ${i.by_name}` : ""}
                    </span>
                    {i.still_in ? (
                      <form action={undoUpload}>
                        <input type="hidden" name="month" value={month} />
                        <input type="hidden" name="id" value={i.id} />
                        <ConfirmButton
                          label="Undo"
                          variant="ghost"
                          question={`Take this upload's ${plural(i.still_in, "line")} back out, sorted or not? Bills it filled in stay as they are.`}
                          confirmLabel="Yes, take it out"
                          pendingLabel="Removing…"
                        />
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </Card>
      </div>

      {todo.length ? (
        <Card pad="md" className="mt-6" id="sort">
          <h2 className="text-base font-semibold text-ink">
            To sort <span className="font-normal text-ink-muted">· {todo.length}</span>
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Pick what each one was. Tick “Always” and every line from that payee is sorted the same way from now on.
          </p>
          {/* Keyed on what's listed, so picks from before a save don't linger on other lines. */}
          <form action={sortAction} key={todo.map((t) => t.id).join(",")}>
            <input type="hidden" name="month" value={month} />
            <ul className="mt-2 divide-y divide-line">
              {todo.map((t) => (
                <LineRow key={t.id} t={t} bills={bills} showAccount={showAccount} />
              ))}
            </ul>
            <div className="mt-3">
              <PendingButton label="Save" />
            </div>
          </form>
        </Card>
      ) : accounts.length ? (
        <p className="mt-6 text-sm text-ink-muted">Everything uploaded is sorted.</p>
      ) : null}

      {accounts.length ? (
        <>
          <div className="mb-4 mt-8 flex flex-wrap items-center gap-2">
            <Button href={`${PATH}?month=${prev}`} variant="ghost" size="sm">← {monthLabel(prev)}</Button>
            <span className="rounded-lg bg-ink px-3 py-1.5 text-sm font-semibold text-paper">{monthLabel(month)}</span>
            {month < thisMonth() ? <Button href={`${PATH}?month=${next}`} variant="ghost" size="sm">{monthLabel(next)} →</Button> : null}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card pad="md">
              <h2 className="text-base font-semibold text-ink">{monthLabel(month)} in the bank</h2>
              <div className="mt-2 flex gap-6 text-sm">
                <span>
                  In <strong className="tabular-nums text-verde-deep">{formatMoney(m.totalIn)}</strong>
                </span>
                <span>
                  Out <strong className="tabular-nums text-ink">{formatMoney(m.totalOut)}</strong>
                </span>
                {m.unsorted ? <span className="text-rust">{m.unsorted} not sorted</span> : null}
              </div>
              {m.groups.length ? (
                <ul className="mt-3 divide-y divide-line text-sm">
                  {m.groups.map((g) => (
                    <li key={g.key} className="flex items-baseline justify-between gap-3 py-1.5">
                      <span className="min-w-0 text-ink-soft">
                        {g.label}
                        <span className="ml-1 text-xs text-ink-muted">
                          {g.n > 1 ? `${g.n} · ` : ""}
                          {g.counts ? "on the Money page" : g.note}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {g.in ? <span className="text-verde-deep">+{formatMoney(g.in)}</span> : null}
                        {g.in && g.out ? " / " : ""}
                        {g.out ? <span className="text-ink">{formatMoney(-g.out)}</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-ink-muted">Nothing sorted for {monthLabel(month)} yet.</p>
              )}
              {counted.length ? (
                <p className="mt-3 text-xs text-ink-muted">
                  Only {counted.map((g) => g.label.toLowerCase()).join(", ")} add to the{" "}
                  <Link href={`/admin/money?month=${month}`} className="underline">Money page</Link>; the rest is already counted from sales,
                  bills, staff cost and rent, or isn&apos;t income or spending.
                </p>
              ) : null}
            </Card>

            <Card pad="md">
              <h2 className="text-base font-semibold text-ink">Payees it remembers</h2>
              {rules.length ? (
                <ul className="mt-2 divide-y divide-line text-sm">
                  {rules.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 py-1.5">
                      <span className="min-w-0">
                        <span className="font-medium text-ink">{r.match}</span>
                        <span className="text-ink-muted">
                          {" "}
                          → {r.category === "bill" ? r.account_name || "a bill" : BANK_CATEGORIES[r.category]?.label} ({r.dir === "out" ? "money out" : "money in"})
                        </span>
                      </span>
                      <form action={removeRule}>
                        <input type="hidden" name="month" value={month} />
                        <input type="hidden" name="id" value={r.id} />
                        <button type="submit" className="text-xs text-ink-muted underline hover:text-rust">Forget</button>
                      </form>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-ink-muted">
                  None yet. Square deposits, TurboTenant, Enbridge, Logan City and Comcast are recognised on their own; tick “Always”
                  when sorting to add more.
                </p>
              )}
            </Card>
          </div>

          {sorted.length ? (
            <Card pad="md" className="mt-4">
              <details>
                <summary className="cursor-pointer text-base font-semibold text-ink">
                  Sorted in {monthLabel(month)} <span className="font-normal text-ink-muted">· {sorted.length} · change any</span>
                </summary>
                <form action={sortAction} key={sorted.map((t) => `${t.id}:${t.category}:${t.expense_account_id}:${t.auto}`).join(",")}>
                  <input type="hidden" name="month" value={month} />
                  <ul className="mt-2 divide-y divide-line">
                    {sorted.map((t) => (
                      <LineRow key={t.id} t={t} bills={bills} showAccount={showAccount} />
                    ))}
                  </ul>
                  <div className="mt-3">
                    <PendingButton label="Save changes" />
                  </div>
                </form>
              </details>
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  );
}


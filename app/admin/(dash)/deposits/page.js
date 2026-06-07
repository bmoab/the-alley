import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  listDepositsToRefund,
  resolveDeposit,
  runDepositReminders,
} from "@/lib/deposits.js";
import {
  spaceName,
  formatDate,
  formatMoney,
} from "@/lib/constants.js";

export const metadata = { title: "Deposits" };

async function refund(formData) {
  "use server";
  await resolveDeposit(Number(formData.get("id")), "refund");
  revalidatePath("/admin/deposits");
  revalidatePath("/admin");
  redirect("/admin/deposits?done=refunded");
}

async function withhold(formData) {
  "use server";
  await resolveDeposit(Number(formData.get("id")), "withhold");
  revalidatePath("/admin/deposits");
  revalidatePath("/admin");
  redirect("/admin/deposits?done=withheld");
}

export default async function DepositsPage({ searchParams }) {
  // Lazy sweep: send any due day-1/2/3 reminders (a cron also hits this daily).
  await runDepositReminders();

  const items = listDepositsToRefund();
  const done = searchParams?.done;

  function daysAgo(ymd) {
    const [y, m, d] = ymd.split("-").map(Number);
    const diff = Math.floor(
      (Date.now() - Date.UTC(y, m - 1, d)) / 86400000
    );
    return diff;
  }

  return (
    <div>
      <p className="eyebrow">Admin</p>
      <h1 className="font-display text-3xl font-semibold text-ink">Deposits to refund</h1>
      <p className="mt-1 text-ink-muted">
        Events that have passed with a cleaning deposit still to resolve. Inspect
        the space, then refund or withhold. Reminders go out on days 1–3 until
        resolved.
      </p>

      {done ? (
        <div className="mt-4 rounded-lg border border-brass/30 bg-brass/10 px-4 py-2 text-sm text-brass-dark">
          Deposit {done}. {done === "refunded" ? "Reminders stopped and the refund was issued." : "Logged as withheld."}
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="mt-6 card p-10 text-center text-ink-muted">
          No deposits awaiting action. 🎉
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {items.map((b) => {
            const ago = daysAgo(b.date);
            return (
              <div key={b.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-xl font-semibold text-ink">
                      {b.client_name}
                    </h3>
                    <p className="text-sm text-ink-muted">
                      {spaceName(b.space)} · {formatDate(b.date)} ·{" "}
                      <span className={ago >= 3 ? "font-semibold text-rust" : ""}>
                        {ago === 0 ? "today" : `${ago} day${ago === 1 ? "" : "s"} ago`}
                      </span>
                    </p>
                    <a href={`mailto:${b.client_email}`} className="text-sm text-brass-dark hover:underline">
                      {b.client_email}
                    </a>
                  </div>
                  <div className="text-right">
                    <div className="font-display text-2xl font-semibold text-ink">
                      {formatMoney(b.deposit)}
                    </div>
                    <div className="text-xs uppercase tracking-wider text-ink-muted">
                      deposit
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex gap-2 border-t border-ink/10 pt-4">
                  <form action={refund}>
                    <input type="hidden" name="id" value={b.id} />
                    <button className="btn-accent !px-4 !py-2 text-sm">
                      Refund deposit
                    </button>
                  </form>
                  <form action={withhold}>
                    <input type="hidden" name="id" value={b.id} />
                    <button className="btn-ghost !px-4 !py-2 text-sm text-rust hover:border-rust/50">
                      Withhold
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

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
import PageHeader from "@/components/admin/ui/PageHeader.js";
import Card from "@/components/admin/ui/Card.js";
import Button from "@/components/admin/ui/Button.js";

export const metadata = { title: "Deposits" };

async function refund(formData) {
  "use server";
  await resolveDeposit(Number(formData.get("id")), "refund");
  revalidatePath("/admin/deposits");
  revalidatePath("/admin");
  redirect(
    "/admin/deposits?toast=" +
      encodeURIComponent("Deposit refunded — reminders stopped.") +
      "&toastType=success"
  );
}

async function withhold(formData) {
  "use server";
  await resolveDeposit(Number(formData.get("id")), "withhold");
  revalidatePath("/admin/deposits");
  revalidatePath("/admin");
  redirect(
    "/admin/deposits?toast=" +
      encodeURIComponent("Deposit logged as withheld.") +
      "&toastType=success"
  );
}

export default async function DepositsPage() {
  // Lazy sweep: send any due day-1/2/3 reminders (a cron also hits this daily).
  await runDepositReminders();

  const items = listDepositsToRefund();

  function daysAgo(ymd) {
    const [y, m, d] = ymd.split("-").map(Number);
    const diff = Math.floor(
      (Date.now() - Date.UTC(y, m - 1, d)) / 86400000
    );
    return diff;
  }

  return (
    <div>
      <PageHeader
        title="Deposits to refund"
        subtitle="Events that have passed with a cleaning deposit still to resolve. Inspect the space, then refund or withhold. Reminders go out on days 1–3 until resolved."
      />

      {items.length === 0 ? (
        <Card pad="lg" className="py-12 text-center text-ink-muted">
          No deposits awaiting action. 🎉
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map((b) => {
            const ago = daysAgo(b.date);
            return (
              <Card key={b.id} pad="md" className="animate-fade-in-up">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-ink">{b.client_name}</h3>
                    <p className="text-sm text-ink-muted">
                      {spaceName(b.space)} · {formatDate(b.date)} ·{" "}
                      <span className={ago >= 3 ? "font-semibold text-rust" : ""}>
                        {ago === 0 ? "today" : `${ago} day${ago === 1 ? "" : "s"} ago`}
                      </span>
                    </p>
                    <a
                      href={`mailto:${b.client_email}`}
                      className="text-sm font-medium text-verde-deep hover:underline"
                    >
                      {b.client_email}
                    </a>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-semibold text-ink">
                      {formatMoney(b.deposit)}
                    </div>
                    <div className="text-xs uppercase tracking-wider text-ink-muted">
                      deposit
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex gap-2 border-t border-line pt-4">
                  <form action={refund}>
                    <input type="hidden" name="id" value={b.id} />
                    <Button type="submit" variant="accent" size="sm">
                      Refund deposit
                    </Button>
                  </form>
                  <form action={withhold}>
                    <input type="hidden" name="id" value={b.id} />
                    <Button type="submit" variant="danger" size="sm">
                      Withhold
                    </Button>
                  </form>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

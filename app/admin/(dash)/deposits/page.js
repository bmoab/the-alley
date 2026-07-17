import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { listDepositsToRefund, resolveDeposit } from "@/lib/deposits.js";
import { getActor, getCurrentUser, canManageBookings, requireBookingManager } from "@/lib/auth.js";
import { spaceName, formatDate, formatMoney } from "@/lib/constants.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import Card from "@/components/admin/ui/Card.js";
import Button from "@/components/admin/ui/Button.js";

export const metadata = { title: "Deposits" };

// One action resolves a deposit: refund a chosen amount (the rest is withheld),
// or "Withhold all" (refund 0). Optional reason is shown to the client + logged.
async function resolve(formData) {
  "use server";
  if (!(await requireBookingManager())) {
    redirect(
      `/admin/deposits?toast=${encodeURIComponent("You don't have permission to resolve deposits.")}&toastType=error`
    );
  }
  const id = Number(formData.get("id"));
  const withholdAll = formData.get("withhold_all");
  const refundAmount = withholdAll ? 0 : Number(formData.get("refund_amount"));
  const reason = (formData.get("reason") || "").toString();

  let result = { noPayment: false, refunded: 0, withheld: 0 };
  try {
    result = await resolveDeposit(id, { refundAmount, reason }, await getActor());
  } catch (err) {
    console.error(`[deposits] resolve action error for #${id}:`, err.message);
    redirect(
      "/admin/deposits?toast=" +
        encodeURIComponent(`Couldn't resolve the deposit: ${err.message}`) +
        "&toastType=error"
    );
  }
  revalidatePath("/admin/deposits");
  revalidatePath("/admin");

  const { noPayment, refunded, withheld } = result;
  const tail = noPayment ? " No Square payment was found — refund manually if you collected one." : "";
  const msg =
    refunded <= 0
      ? `Deposit withheld (${formatMoney(withheld)}). The client was notified.`
      : withheld > 0
        ? `Refunded ${formatMoney(refunded)}, kept ${formatMoney(withheld)}.${tail}`
        : `Deposit refunded (${formatMoney(refunded)}).${tail}`;
  redirect(
    "/admin/deposits?toast=" + encodeURIComponent(msg) + "&toastType=" + (noPayment ? "neutral" : "success")
  );
}

export default function DepositsPage() {
  // NOTE: reminders are sent only by the scheduled cron (GET
  // /api/cron/deposit-reminders, point it at ~9am America/Denver). We no longer
  // fire them on page load, so opening this page never sends an email.
  const items = listDepositsToRefund();

  function daysAgo(ymd) {
    const [y, m, d] = ymd.split("-").map(Number);
    return Math.floor((Date.now() - Date.UTC(y, m - 1, d)) / 86400000);
  }

  return (
    <div>
      <PageHeader
        title="Deposits to refund"
        subtitle="Events that have passed with a cleaning deposit still to resolve. Inspect the space, then refund all, part, or none of it. Reminders go out at 9am on days 1–3 until resolved."
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
                    <div className="text-2xl font-semibold text-ink">{formatMoney(b.deposit)}</div>
                    <div className="text-xs uppercase tracking-wider text-ink-muted">deposit</div>
                  </div>
                </div>

                <form action={resolve} className="mt-4 border-t border-line pt-4">
                  <input type="hidden" name="id" value={b.id} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="label" htmlFor={`amt-${b.id}`}>Refund amount</label>
                      <input
                        id={`amt-${b.id}`}
                        name="refund_amount"
                        type="number"
                        min="0"
                        max={b.deposit}
                        step="1"
                        defaultValue={b.deposit}
                        className="field"
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor={`reason-${b.id}`}>Reason (if keeping any)</label>
                      <input
                        id={`reason-${b.id}`}
                        name="reason"
                        placeholder="e.g. scuffed wall, missing chair"
                        className="field"
                      />
                    </div>
                  </div>
                  <p className="mt-1.5 text-xs text-ink-muted">
                    Refund up to {formatMoney(b.deposit)}. Lower it to keep part for damages; the rest is
                    recorded as withheld. The client is emailed either way.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="submit" variant="accent" size="sm">Resolve deposit</Button>
                    <Button type="submit" name="withhold_all" value="1" variant="danger" size="sm">
                      Withhold all
                    </Button>
                  </div>
                </form>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

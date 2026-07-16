import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  getSeries,
  cancellationQuote,
  cancelBooking,
  setSeriesDepositRefunded,
  getBooking,
} from "@/lib/bookings.js";
import { refundPayment, refundSeriesDeposit } from "@/lib/square.js";
import { emailClientSeriesCancelled } from "@/lib/email.js";
import { getActor } from "@/lib/auth.js";
import { logActivity, logEmail } from "@/lib/activity.js";
import { spaceName, formatDate, formatTime, formatMoney } from "@/lib/constants.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import Card from "@/components/admin/ui/Card.js";
import Button from "@/components/admin/ui/Button.js";

export const metadata = { title: "Cancel recurring series" };

/** Sessions that still hold a slot (not already cancelled/denied/expired). */
const liveStatuses = ["reserved", "held", "confirmed", "completed"];

async function confirmCancelSeries(formData) {
  "use server";
  const seriesId = Number(formData.get("series_id"));
  const rows = getSeries(seriesId);
  if (!rows.length) redirect("/admin/bookings");
  const holder = rows.find((r) => r.is_deposit_holder) || rows[0];
  const actor = await getActor();

  // Refund each paid session's rental per its own cutoff; cancel every live row.
  let rentalRefunded = 0;
  for (const r of rows) {
    if (!liveStatuses.includes(r.status)) continue;
    const quote = cancellationQuote(r);
    let refundAmount = 0;
    let refundType = "none";
    if (quote.hasPayment && quote.refundAmount > 0) {
      try {
        const res = await refundPayment(r, quote.refundAmount, "Recurring series cancellation — session rental");
        if (!res?.noPayment) {
          refundAmount = quote.refundAmount;
          refundType = quote.refundType;
          rentalRefunded += refundAmount;
        }
      } catch (err) {
        console.error(`[cancel-series] rental refund failed for #${r.id}:`, err.message);
      }
    }
    cancelBooking(r.id, { refundAmount, refundType, cancelledBy: actor.actorName });
  }

  // Refund the one series deposit (if it was paid) against its own invoice.
  let depositRefunded = 0;
  if (holder.deposit_payment_status === "paid" && Number(holder.deposit) > 0) {
    try {
      const res = await refundSeriesDeposit(holder, holder.deposit);
      if (!res?.noPayment) depositRefunded = Number(holder.deposit) || 0;
    } catch (err) {
      console.error(`[cancel-series] deposit refund failed for series ${seriesId}:`, err.message);
    }
  }
  setSeriesDepositRefunded(holder.id, depositRefunded);

  logActivity({
    bookingId: holder.id,
    eventType: "cancelled",
    description: `Recurring series cancelled (${rows.length} sessions) · refunded ${formatMoney(rentalRefunded + depositRefunded)}`,
    amount: rentalRefunded + depositRefunded || null,
    metadata: { rental_refunded: rentalRefunded, deposit_refunded: depositRefunded, series_id: seriesId },
    ...actor,
  });

  try {
    const res = await emailClientSeriesCancelled(getBooking(holder.id), getSeries(seriesId), {
      rentalRefunded,
      depositRefunded,
    });
    logEmail({
      bookingId: holder.id,
      eventType: "cancellation_sent",
      description: "Series cancellation confirmation sent",
      recipientEmail: holder.client_email,
      sendResult: res,
    });
  } catch (err) {
    console.error(`[cancel-series] email failed for series ${seriesId}:`, err.message);
  }

  revalidatePath("/admin/bookings");
  revalidatePath("/admin");
  redirect(
    "/admin/bookings?toast=" +
      encodeURIComponent(
        `Series cancelled. Refunded ${formatMoney(rentalRefunded + depositRefunded)} total.`
      ) +
      "&toastType=success"
  );
}

export default function CancelSeriesPage({ params }) {
  const seriesId = Number(params.seriesId);
  const rows = getSeries(seriesId);
  if (!rows.length) redirect("/admin/bookings");
  const holder = rows.find((r) => r.is_deposit_holder) || rows[0];
  const live = rows.filter((r) => liveStatuses.includes(r.status));

  let est = 0;
  for (const r of live) est += cancellationQuote(r).refundAmount;
  const depositBack = holder.deposit_payment_status === "paid" ? Number(holder.deposit) || 0 : 0;

  return (
    <div>
      <PageHeader
        eyebrow="Cancellation"
        title="Cancel this entire recurring series?"
        subtitle="Every remaining session is cancelled and refunded per the policy. Nothing happens until you confirm."
      />
      <Card pad="lg" className="max-w-xl">
        <h2 className="text-lg font-semibold text-ink">{holder.client_name}</h2>
        <p className="text-sm text-ink-muted">
          {spaceName(holder.space)} · {holder.recurring_schedule || `${rows.length} sessions`}
        </p>

        <ul className="mt-4 space-y-1 text-sm text-ink-soft">
          {rows.map((r) => (
            <li key={r.id} className="flex justify-between gap-3">
              <span>
                Session {r.series_index}: {formatDate(r.date)} · {formatTime(r.start_time)}
              </span>
              <span className="text-ink-muted capitalize">{r.status}</span>
            </li>
          ))}
        </ul>

        <dl className="mt-5 space-y-1.5 border-t border-line pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-muted">Session rentals to refund</dt>
            <dd className="font-medium text-ink">{formatMoney(est)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-muted">Deposit to refund</dt>
            <dd className="font-medium text-ink">{formatMoney(depositBack)}</dd>
          </div>
          <div className="mt-2 flex justify-between border-t border-line pt-3">
            <dt className="font-semibold text-ink">Estimated total refund</dt>
            <dd className="text-lg font-semibold text-ink">{formatMoney(est + depositBack)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-ink-muted">
          Sessions within the {cancellationQuote(holder).cutoffHours}-hour cutoff forfeit their rental.
          Unpaid sessions simply free their slot.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          <form action={confirmCancelSeries}>
            <input type="hidden" name="series_id" value={seriesId} />
            <Button type="submit" variant="danger">
              Confirm — cancel all {rows.length} sessions
            </Button>
          </form>
          <Button href="/admin/bookings" variant="ghost">
            Keep series
          </Button>
        </div>
      </Card>
    </div>
  );
}

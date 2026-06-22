import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  getBooking,
  cancellationQuote,
  cancelBooking,
} from "@/lib/bookings.js";
import { refundPayment } from "@/lib/square.js";
import { emailClientCancelled } from "@/lib/email.js";
import { getSession } from "@/lib/auth.js";
import { spaceName, formatDate, formatTime, formatMoney } from "@/lib/constants.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import Card from "@/components/admin/ui/Card.js";
import Badge from "@/components/admin/ui/Badge.js";
import Button from "@/components/admin/ui/Button.js";

export const metadata = { title: "Cancel booking" };

async function confirmCancel(formData) {
  "use server";
  const id = Number(formData.get("id"));
  const booking = getBooking(id);
  if (!booking) redirect("/admin/bookings");
  if (booking.status === "cancelled") redirect("/admin/bookings");

  const quote = cancellationQuote(booking);
  const session = await getSession();

  // Issue the Square refund (partial deposit-only or full) before recording.
  if (quote.hasPayment && quote.refundAmount > 0) {
    try {
      await refundPayment(
        booking,
        quote.refundAmount,
        quote.refundType === "full"
          ? "Cancellation — full refund (rental + deposit)"
          : "Cancellation — deposit refund (rental forfeited)"
      );
    } catch (err) {
      console.error(`[cancel] refund failed for #${id}:`, err.message);
      redirect(
        `/admin/bookings/${id}/cancel?toast=` +
          encodeURIComponent(`Refund failed: ${err.message}. Booking was NOT cancelled.`) +
          "&toastType=error"
      );
    }
  }

  cancelBooking(id, {
    refundAmount: quote.refundAmount,
    refundType: quote.refundType,
    cancelledBy: session?.email || "owner",
  });

  try {
    await emailClientCancelled(getBooking(id));
  } catch (err) {
    console.error(`[cancel] cancellation email failed for #${id}:`, err.message);
  }

  revalidatePath("/admin/bookings");
  revalidatePath("/admin/all-requests");
  revalidatePath("/admin/calendar");
  revalidatePath("/admin");
  redirect(
    "/admin/bookings?toast=" +
      encodeURIComponent(
        quote.refundType === "none"
          ? `Booking #${id} cancelled. No payment on file — nothing refunded.`
          : `Booking #${id} cancelled. Refunded ${formatMoney(quote.refundAmount)} (${quote.refundType === "full" ? "full" : "deposit only"}).`
      ) +
      "&toastType=success"
  );
}

export default async function CancelBookingPage({ params }) {
  const id = Number(params.id);
  const booking = getBooking(id);
  if (!booking) redirect("/admin/bookings");
  if (booking.status === "cancelled") {
    redirect(
      "/admin/all-requests?status=cancelled&toast=" +
        encodeURIComponent(`Booking #${id} is already cancelled.`) +
        "&toastType=neutral"
    );
  }

  const quote = cancellationQuote(booking);
  const within = quote.side === "within";

  return (
    <div>
      <PageHeader
        eyebrow="Cancellation"
        title="Cancel this booking?"
        subtitle="Review the refund below. Nothing happens until you confirm."
      />

      <Card pad="lg" className="max-w-xl">
        {/* Booking summary */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">{booking.client_name}</h2>
            <p className="text-sm text-ink-muted">
              {spaceName(booking.space)} · {formatDate(booking.date)} ·{" "}
              {formatTime(booking.start_time)} · {booking.hours}h
            </p>
            <a
              href={`mailto:${booking.client_email}`}
              className="text-sm font-medium text-verde-deep hover:underline"
            >
              {booking.client_email}
            </a>
          </div>
          <Badge status={booking.status} />
        </div>

        {/* Cutoff position */}
        <div
          className={`mt-5 rounded-xl border p-4 ${
            within ? "border-rust/30 bg-rust/5" : "border-verde-deep/30 bg-verde/40"
          }`}
        >
          <p className="text-sm font-semibold text-ink">
            {within
              ? `Within the ${quote.cutoffHours}-hour cutoff`
              : `More than ${quote.cutoffHours} hours before the event`}
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            {within
              ? "Per the rental agreement, the rental fee is forfeited and only the cleaning deposit is refunded."
              : "Per the rental agreement, the full amount (rental + deposit) is refunded."}
          </p>
        </div>

        {/* Refund breakdown */}
        <dl className="mt-5 space-y-1.5 text-sm">
          <Row label="Rental" value={formatMoney(quote.rental)} />
          <Row label="Cleaning deposit" value={formatMoney(quote.deposit)} />
          <Row label="Paid in full?" value={quote.hasPayment ? "Yes" : "No — nothing collected yet"} />
          {quote.rentalForfeited > 0 ? (
            <Row label="Forfeited (rental)" value={`– ${formatMoney(quote.rentalForfeited)}`} danger />
          ) : null}
          <div className="mt-2 flex items-center justify-between border-t border-line pt-3">
            <dt className="font-semibold text-ink">Refund to client</dt>
            <dd className="text-lg font-semibold text-ink">{formatMoney(quote.refundAmount)}</dd>
          </div>
          {quote.refundType === "none" ? (
            <p className="text-xs text-ink-muted">
              No captured payment on this booking, so there is nothing to refund. It will simply be
              cancelled and the slot reopened.
            </p>
          ) : null}
        </dl>

        <p className="mt-5 text-xs text-ink-muted">
          On confirm: the refund above is issued via Square, the booking is marked <strong>cancelled</strong>{" "}
          (freeing its time slot), and a cancellation email is sent to the client. The booking stays in your
          history.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          <form action={confirmCancel}>
            <input type="hidden" name="id" value={booking.id} />
            <Button type="submit" variant="danger">
              {quote.refundType === "none"
                ? "Confirm cancellation"
                : `Confirm — refund ${formatMoney(quote.refundAmount)}`}
            </Button>
          </form>
          <Button href="/admin/bookings" variant="ghost">
            Keep booking
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value, danger }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-ink-muted">{label}</dt>
      <dd className={danger ? "font-medium text-rust" : "font-medium text-ink"}>{value}</dd>
    </div>
  );
}

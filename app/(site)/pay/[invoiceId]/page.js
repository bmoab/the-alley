import { redirect } from "next/navigation";
import Link from "next/link";
import { getBookingByInvoice } from "@/lib/bookings.js";
import { confirmBookingPaid } from "@/lib/payments.js";
import {
  spaceName,
  formatDate,
  formatTime,
  formatMoney,
} from "@/lib/constants.js";

export const metadata = { title: "Complete your payment" };

async function pay(formData) {
  "use server";
  const invoiceId = formData.get("invoiceId");
  const booking = getBookingByInvoice(invoiceId);
  if (booking) await confirmBookingPaid(booking.id);
  redirect(`/pay/${invoiceId}?done=1`);
}

export default function PayPage({ params, searchParams }) {
  const booking = getBookingByInvoice(params.invoiceId);
  const done = searchParams?.done;

  if (!booking) {
    return (
      <main className="container-content py-20 text-center">
        <h1 className="font-display text-3xl font-semibold text-ink">
          Payment link not found
        </h1>
        <p className="mt-3 text-ink-muted">
          This payment link is invalid or has expired.
        </p>
        <Link href="/" className="btn-primary mt-6">Back home</Link>
      </main>
    );
  }

  if (done || booking.payment_status === "paid") {
    return (
      <main className="container-content py-20">
        <div className="card mx-auto max-w-md p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brass/15 text-2xl text-brass-dark">✓</div>
          <h1 className="mt-4 font-display text-2xl font-semibold text-ink">Payment complete</h1>
          <p className="mt-3 text-ink-muted">
            Thank you, {booking.client_name.split(" ")[0]}! Your booking is
            confirmed and a confirmation email is on its way.
          </p>
          <Link href="/" className="btn-primary mt-6">Back home</Link>
        </div>
      </main>
    );
  }

  const rental = booking.total - booking.deposit;

  return (
    <main className="container-content py-16">
      <div className="mx-auto max-w-md">
        <p className="eyebrow text-center">Complete your booking</p>
        <h1 className="mt-2 text-center font-display text-3xl font-semibold text-ink">
          Secure payment
        </h1>

        <div className="card mt-6 p-6">
          <dl className="divide-y divide-ink/10 text-sm">
            {[
              ["Space", spaceName(booking.space)],
              ["Date", formatDate(booking.date)],
              ["Time", `${formatTime(booking.start_time)} · ${booking.hours}h`],
              ["Space rental", formatMoney(rental)],
              ["Refundable deposit", formatMoney(booking.deposit)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 py-2">
                <dt className="text-ink-muted">{k}</dt>
                <dd className="text-right font-medium text-ink">{v}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-4 py-3 font-display text-lg font-semibold text-ink">
              <dt>Total due</dt>
              <dd>{formatMoney(booking.total)}</dd>
            </div>
          </dl>

          <form action={pay} className="mt-4">
            <input type="hidden" name="invoiceId" value={params.invoiceId} />
            <button className="btn-accent w-full">
              Pay {formatMoney(booking.total)}
            </button>
          </form>
          <p className="mt-3 text-center text-xs text-ink-muted">
            Demo checkout — in production this is a secure Square payment page.
          </p>
        </div>
      </div>
    </main>
  );
}

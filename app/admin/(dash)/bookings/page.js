import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { listBookings, getBooking } from "@/lib/bookings.js";
import { confirmBookingPaid, releaseExpiredHolds } from "@/lib/payments.js";
import { getInvoiceStatus } from "@/lib/square.js";
import {
  SPACES,
  spaceName,
  formatDate,
  formatTime,
  formatMoney,
} from "@/lib/constants.js";

export const metadata = { title: "Bookings" };

async function markPaid(formData) {
  "use server";
  const id = Number(formData.get("id"));
  await confirmBookingPaid(id);
  revalidatePath("/admin/bookings");
  revalidatePath("/admin");
  revalidatePath("/admin/events");
  redirect("/admin/bookings?paid=" + id);
}

// Ask Square whether the invoice has been paid; if so, confirm the booking.
async function checkPayment(formData) {
  "use server";
  const id = Number(formData.get("id"));
  const b = getBooking(id);
  let result = "nopay";
  if (b?.square_invoice_id) {
    try {
      const status = await getInvoiceStatus(b.square_invoice_id);
      if (status === "paid") {
        await confirmBookingPaid(id);
        result = "paid";
      }
    } catch (err) {
      console.error("[bookings] check payment error:", err.message);
      result = "error";
    }
  }
  revalidatePath("/admin/bookings");
  revalidatePath("/admin");
  revalidatePath("/admin/events");
  redirect("/admin/bookings?" + (result === "paid" ? "paid=" + id : "checked=" + id + "&r=" + result) + "#b-" + id);
}

const STATUS_STYLES = {
  held: "bg-amber-100 text-amber-800 border-amber-200",
  confirmed: "bg-brass/15 text-brass-dark border-brass/30",
  completed: "bg-ink/10 text-ink-soft border-ink/15",
  pending: "bg-paper-warm text-ink-muted border-ink/10",
  denied: "bg-rust/10 text-rust border-rust/20",
  expired: "bg-rust/10 text-rust border-rust/20",
};

function StatusBadge({ status }) {
  return (
    <span
      className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${
        STATUS_STYLES[status] || STATUS_STYLES.pending
      }`}
    >
      {status}
    </span>
  );
}

export default async function BookingsPage({ searchParams }) {
  // Lazy sweep: release any holds whose 3-day window has lapsed (a cron would do
  // this in production). Notifies affected clients.
  await releaseExpiredHolds();

  const spaceFilter = searchParams?.space || "";
  const paid = searchParams?.paid;
  const checked = searchParams?.checked;
  const checkResult = searchParams?.r;
  const focus = Number(searchParams?.focus) || 0;
  // Everything that lives on the calendar / has moved past the request stage.
  const all = listBookings(spaceFilter ? { space: spaceFilter } : {}).filter(
    (b) => b.status !== "pending" && b.status !== "denied"
  );

  return (
    <div>
      <p className="eyebrow">Admin</p>
      <h1 className="font-display text-3xl font-semibold text-ink">Bookings</h1>
      <p className="mt-1 text-ink-muted">
        Held, confirmed, and past bookings.
      </p>

      {paid ? (
        <div className="mt-4 rounded-lg border border-brass/30 bg-brass/10 px-4 py-2 text-sm text-brass-dark">
          Payment recorded for booking #{paid} — it&rsquo;s confirmed, the client
          has been emailed, and any public-event host invite has been sent.
        </div>
      ) : null}
      {checked ? (
        <div className="mt-4 rounded-lg border border-ink/15 bg-paper-warm px-4 py-2 text-sm text-ink-soft">
          {checkResult === "error"
            ? `Couldn't reach Square to check booking #${checked}. Try again, or use "Mark as paid".`
            : `No payment recorded for booking #${checked} yet — the customer may not have paid, or it's still processing. Check again in a moment.`}
        </div>
      ) : null}

      {/* Space filter */}
      <div className="mt-5 inline-flex rounded-full border border-ink/15 bg-paper-card p-1">
        <Link
          href="/admin/bookings"
          className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
            !spaceFilter ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"
          }`}
        >
          All spaces
        </Link>
        {SPACES.map((s) => (
          <Link
            key={s.id}
            href={`/admin/bookings?space=${s.id}`}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
              spaceFilter === s.id ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"
            }`}
          >
            {s.name}
          </Link>
        ))}
      </div>

      {all.length === 0 ? (
        <div className="mt-6 card p-10 text-center text-ink-muted">
          No bookings yet. Approve a request to place a hold on the calendar.
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left text-xs uppercase tracking-wider text-ink-muted">
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Space</th>
                <th className="py-2 pr-4">Client</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Payment</th>
                <th className="py-2 pr-4 text-right">Total</th>
                <th className="py-2 pl-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {all.map((b) => (
                <tr key={b.id} id={`b-${b.id}`} className={`border-b border-ink/5 ${focus === b.id ? "bg-brass/10" : ""}`}>
                  <td className="py-3 pr-4">
                    <div className="font-medium text-ink">{formatDate(b.date)}</div>
                    <div className="text-xs text-ink-muted">
                      {formatTime(b.start_time)} · {b.hours}h
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-ink-soft">{spaceName(b.space)}</td>
                  <td className="py-3 pr-4">
                    <div className="text-ink">{b.client_name}</div>
                    <div className="text-xs text-ink-muted">{b.client_email}</div>
                  </td>
                  <td className="py-3 pr-4"><StatusBadge status={b.status} /></td>
                  <td className="py-3 pr-4 capitalize text-ink-soft">
                    {b.payment_status || "unpaid"}
                    {b.status === "held" && b.hold_expires_at ? (
                      <div className="text-xs text-ink-muted">
                        holds until {formatDate(b.hold_expires_at.slice(0, 10))}
                      </div>
                    ) : null}
                  </td>
                  <td className="py-3 pr-4 text-right font-medium text-ink">
                    {formatMoney(b.total)}
                  </td>
                  <td className="py-3 pl-4 text-right">
                    {b.status === "held" ? (
                      <div className="flex flex-col items-end gap-1.5">
                        {b.square_invoice_id ? (
                          <form action={checkPayment}>
                            <input type="hidden" name="id" value={b.id} />
                            <button className="btn-ghost !px-3 !py-1.5 text-xs">Check for payment</button>
                          </form>
                        ) : null}
                        <form action={markPaid}>
                          <input type="hidden" name="id" value={b.id} />
                          <button className="btn-accent !px-3 !py-1.5 text-xs">Mark as paid</button>
                        </form>
                        {b.payment_link ? (
                          <a href={b.payment_link} target="_blank" rel="noreferrer" className="text-xs text-brass-dark hover:underline">
                            Open invoice ↗
                          </a>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-xs text-ink-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  listBookings,
  approveBooking,
  denyBooking,
  getBooking,
  setInvoiceInfo,
} from "@/lib/bookings.js";
import { createBookingInvoice } from "@/lib/square.js";
import { emailClientApproved, emailClientDenied } from "@/lib/email.js";
import RequestCard from "@/components/RequestCard.js";

export const metadata = { title: "Requests" };

function refresh() {
  revalidatePath("/admin/requests");
  revalidatePath("/admin");
  revalidatePath("/admin/bookings");
}

async function approve(formData) {
  "use server";
  const id = Number(formData.get("id"));
  let booking = approveBooking(id, {
    rate: formData.get("rate"),
    hours: formData.get("hours"),
    sessions: formData.get("sessions"),
    deposit: formData.get("deposit"),
  });

  let problem = "";
  try {
    // #5 Square: create the invoice (rental + deposit) and store id + pay link.
    const { invoiceId, paymentLink } = await createBookingInvoice(booking);
    booking = setInvoiceInfo(id, { invoiceId, paymentLink });
    // #6 Email: approval + payment link + rental agreement PDF attached.
    await emailClientApproved(booking);
  } catch (err) {
    console.error("[requests] approve post-processing error:", err.message);
    problem = err.message || "invoice/email error";
  }
  // The host listing invite (for public events) is sent after payment — see
  // lib/payments.js confirmBookingPaid().

  refresh();
  redirect("/admin/requests?approved=" + id + (problem ? "&warn=" + encodeURIComponent(problem) : ""));
}

async function deny(formData) {
  "use server";
  const id = Number(formData.get("id"));
  denyBooking(id);
  try {
    await emailClientDenied(getBooking(id));
  } catch (err) {
    console.error("[requests] deny email error:", err.message);
  }
  refresh();
  redirect("/admin/requests?denied=" + id);
}

export default function RequestsPage({ searchParams }) {
  const pending = listBookings({ status: "pending" });
  const approved = searchParams?.approved;
  const denied = searchParams?.denied;
  const warn = searchParams?.warn;

  return (
    <div>
      <p className="eyebrow">Admin</p>
      <h1 className="font-display text-3xl font-semibold text-ink">Requests</h1>
      <p className="mt-1 text-ink-muted">
        Pending booking requests. Adjust pricing if needed, then approve (places a
        hold and sends a payment link) or deny.
      </p>

      {approved ? (
        <div className="mt-4 rounded-lg border border-brass/30 bg-brass/10 px-4 py-2 text-sm text-brass-dark">
          Request #{approved} approved — a hold is on the calendar and the client
          will receive a payment link.
        </div>
      ) : null}
      {warn ? (
        <div className="mt-2 rounded-lg border border-rust/30 bg-rust/10 px-4 py-2 text-sm text-rust">
          Approved, but the invoice/email step had a problem: {warn}. The hold is placed — you can resend from
          Bookings once resolved.
        </div>
      ) : null}
      {denied ? (
        <div className="mt-4 rounded-lg border border-ink/15 bg-paper-warm px-4 py-2 text-sm text-ink-soft">
          Request #{denied} was declined.
        </div>
      ) : null}

      {pending.length === 0 ? (
        <div className="mt-6 card p-10 text-center text-ink-muted">
          No pending requests right now. New requests from the website will appear
          here.
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          {pending.map((b) => (
            <RequestCard
              key={b.id}
              booking={b}
              approveAction={approve}
              denyAction={deny}
            />
          ))}
        </div>
      )}
    </div>
  );
}

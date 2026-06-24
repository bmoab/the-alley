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
import { logActivity, logEmail } from "@/lib/activity.js";
import { getActor } from "@/lib/auth.js";
import { resolveDenial } from "@/lib/denial.js";
import { formatMoney } from "@/lib/constants.js";
import RequestCard from "@/components/RequestCard.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import Card from "@/components/admin/ui/Card.js";

export const metadata = { title: "Requests" };

function toastRedirect(message, type = "success") {
  redirect(
    "/admin/requests?toast=" + encodeURIComponent(message) + "&toastType=" + type
  );
}

function refresh() {
  revalidatePath("/admin/requests");
  revalidatePath("/admin");
  revalidatePath("/admin/bookings");
}

async function approve(formData) {
  "use server";
  const id = Number(formData.get("id"));
  const actor = await getActor();
  let booking = approveBooking(id, {
    rate: formData.get("rate"),
    hours: formData.get("hours"),
    sessions: formData.get("sessions"),
    deposit: formData.get("deposit"),
  });

  // Activity: approved (by the real logged-in user).
  logActivity({
    bookingId: booking.id,
    eventType: "approved",
    description: `Approved · hold placed (${formatMoney(booking.total)})`,
    amount: booking.total,
    ...actor,
  });

  let problem = "";
  try {
    // #5 Square: create the invoice (rental + deposit) and store id + pay link.
    const { invoiceId, paymentLink } = await createBookingInvoice(booking);
    booking = setInvoiceInfo(id, { invoiceId, paymentLink });
    // #6 Email: approval + payment link + rental agreement PDF attached.
    const res = await emailClientApproved(booking);
    logEmail({
      bookingId: booking.id,
      eventType: "invoice_sent",
      description: `Invoice / payment link sent · ${formatMoney(booking.total)}`,
      recipientEmail: booking.client_email,
      amount: booking.total,
      sendResult: res,
    });
  } catch (err) {
    console.error("[requests] approve post-processing error:", err.message);
    problem = err.message || "invoice/email error";
  }
  // The host listing invite (for public events) is sent after payment — see
  // lib/payments.js confirmBookingPaid().

  refresh();
  if (problem) {
    toastRedirect(
      `Approved (hold placed), but the invoice/email step failed: ${problem}. Resend from Bookings once resolved.`,
      "error"
    );
  }
  toastRedirect(
    `Request approved — a hold is on the calendar and the client was sent a payment link.`
  );
}

async function deny(formData) {
  "use server";
  const id = Number(formData.get("id"));
  const actor = await getActor();

  // Resolve the denial reason: internal label (candid, logged) vs. client
  // phrasing (gracious, emailed). "Other" keeps free text internal-only.
  const { reasonValue, internalLabel, clientPhrasing } = resolveDenial(
    formData.get("reason"),
    formData.get("reason_note")
  );

  denyBooking(id);

  // Activity: denied — records the actor + the internal reason in metadata.
  logActivity({
    bookingId: id,
    eventType: "denied",
    description: `Denied — ${internalLabel}`,
    metadata: { reason: reasonValue, internal_label: internalLabel },
    ...actor,
  });

  try {
    const booking = getBooking(id);
    const res = await emailClientDenied(booking, clientPhrasing);
    logEmail({
      bookingId: id,
      eventType: "denial_sent",
      description: "Denial email sent",
      recipientEmail: booking.client_email,
      sendResult: res,
    });
  } catch (err) {
    console.error("[requests] deny email error:", err.message);
  }
  refresh();
  toastRedirect(`Request declined — the client has been notified.`, "neutral");
}

export default function RequestsPage() {
  // Oldest submitted at the top (FIFO) so requests are worked in arrival order.
  const pending = listBookings({ status: "pending", sort: "created_asc" });

  return (
    <div>
      <PageHeader
        title="Requests"
        subtitle="Pending booking requests. Adjust pricing if needed, then approve (places a hold and sends a payment link) or deny."
      />

      {pending.length === 0 ? (
        <Card pad="lg" className="py-12 text-center text-ink-muted">
          No pending requests right now. New requests from the website will appear
          here.
        </Card>
      ) : (
        <div className="space-y-5">
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

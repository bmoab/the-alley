import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  listBookings,
  approveBooking,
  denyBooking,
  getBooking,
  setInvoiceInfo,
  reserveSeries,
  getSeries,
  denySeries,
  setDepositInvoiceInfo,
  rentalAmount,
} from "@/lib/bookings.js";
import { createBookingInvoice, createDepositInvoice } from "@/lib/square.js";
import { emailClientApproved, emailClientDenied, emailClientSeriesApproved } from "@/lib/email.js";
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

async function approveSeries(formData) {
  "use server";
  const seriesId = Number(formData.get("series_id"));
  const actor = await getActor();
  const pricing = {
    rate: formData.get("rate"),
    hours: formData.get("hours"),
    deposit: formData.get("deposit"),
  };
  const invoiceMode = formData.get("invoice_mode") === "upfront" ? "upfront" : "scheduled";

  // Apply pricing across the series + place every date on the calendar (reserved).
  let rows = reserveSeries(seriesId, pricing);
  const holder = rows.find((r) => r.is_deposit_holder) || rows[0];

  logActivity({
    bookingId: holder.id,
    eventType: "approved",
    description: `Recurring series approved (${rows.length} sessions) · holds placed`,
    amount: rentalAmount(holder) * rows.length + (Number(holder.deposit) || 0),
    ...actor,
  });

  let problem = "";
  try {
    // One deposit invoice for the series (on the holder), always up front.
    const dep = await createDepositInvoice(holder);
    setDepositInvoiceInfo(holder.id, { invoiceId: dep.invoiceId, paymentLink: dep.paymentLink });

    // Rental invoices: scheduled → first session now (the cron sends the rest);
    // up-front → every session now. Each row is rental-only (series_id set).
    const toInvoice = invoiceMode === "upfront" ? rows : [holder];
    for (const r of toInvoice) {
      const { invoiceId, paymentLink } = await createBookingInvoice(getBooking(r.id));
      setInvoiceInfo(r.id, { invoiceId, paymentLink });
      logActivity({
        bookingId: r.id,
        eventType: "invoice_sent",
        description: `Rental invoice sent · session ${r.series_index} of ${r.series_total}`,
        amount: rentalAmount(r),
        ...actor,
      });
    }

    rows = getSeries(seriesId);
    const res = await emailClientSeriesApproved(getBooking(holder.id), rows);
    logEmail({
      bookingId: holder.id,
      eventType: "invoice_sent",
      description: `Series approval sent · deposit + ${invoiceMode === "upfront" ? "all" : "first"} rental invoice`,
      recipientEmail: holder.client_email,
      sendResult: res,
    });
  } catch (err) {
    console.error("[requests] series approve error:", err.message);
    problem = err.message || "invoice/email error";
  }

  refresh();
  if (problem) {
    toastRedirect(
      `Series approved (holds placed), but the invoice/email step failed: ${problem}.`,
      "error"
    );
  }
  toastRedirect(`Recurring series approved — holds placed and the client was invoiced.`);
}

async function denySeriesAction(formData) {
  "use server";
  const id = Number(formData.get("id"));
  const actor = await getActor();
  const { reasonValue, internalLabel, clientPhrasing } = resolveDenial(
    formData.get("reason"),
    formData.get("reason_note")
  );
  const holder = getBooking(id);
  if (!holder?.series_id) return deny(formData); // safety fallback
  denySeries(holder.series_id);

  logActivity({
    bookingId: holder.id,
    eventType: "denied",
    description: `Recurring series denied — ${internalLabel}`,
    metadata: { reason: reasonValue, internal_label: internalLabel },
    ...actor,
  });

  try {
    const res = await emailClientDenied(holder, clientPhrasing);
    logEmail({
      bookingId: holder.id,
      eventType: "denial_sent",
      description: "Series denial email sent",
      recipientEmail: holder.client_email,
      sendResult: res,
    });
  } catch (err) {
    console.error("[requests] series deny email error:", err.message);
  }
  refresh();
  toastRedirect(`Recurring request declined — the client has been notified.`, "neutral");
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

  // Collapse each recurring series into a single card (anchored at the holder).
  const seenSeries = new Set();
  const items = [];
  for (const b of pending) {
    if (b.series_id) {
      if (seenSeries.has(b.series_id)) continue;
      seenSeries.add(b.series_id);
      const rows = getSeries(b.series_id).filter((r) => r.status === "pending");
      if (rows.length) {
        items.push({ type: "series", holder: rows.find((r) => r.is_deposit_holder) || rows[0], rows });
      }
    } else {
      items.push({ type: "single", booking: b });
    }
  }

  return (
    <div>
      <PageHeader
        title="Requests"
        subtitle="Pending booking requests. Adjust pricing if needed, then approve (places a hold and sends a payment link) or deny."
      />

      {items.length === 0 ? (
        <Card pad="lg" className="py-12 text-center text-ink-muted">
          No pending requests right now. New requests from the website will appear
          here.
        </Card>
      ) : (
        <div className="space-y-5">
          {items.map((it) =>
            it.type === "series" ? (
              <RequestCard
                key={`s${it.holder.series_id}`}
                booking={it.holder}
                series={it.rows}
                approveSeriesAction={approveSeries}
                denyAction={denySeriesAction}
              />
            ) : (
              <RequestCard
                key={it.booking.id}
                booking={it.booking}
                approveAction={approve}
                denyAction={deny}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  getBooking,
  findRestoreConflict,
  restoreBooking,
  archiveBooking,
  unarchiveBooking,
  keepBookingOnCalendar,
  reArmHold,
  ensureRescheduleToken,
} from "@/lib/bookings.js";
import { confirmBookingPaid, resendInvoice } from "@/lib/payments.js";
import { getInvoiceStatus } from "@/lib/square.js";
import { emailClientRescheduleLink } from "@/lib/email.js";
import { logActivity, logEmail } from "@/lib/activity.js";
import { getActor, requireBookingManager } from "@/lib/auth.js";
import { setBookingListingPublic } from "@/lib/listing-visibility.js";
import { spaceName, formatDate, formatTime } from "@/lib/constants.js";

/**
 * The booking actions behind the Events page's ⋯ menu (moved here from the old
 * Bookings page). Each one returns to the same filtered view of /admin/events.
 */

function refresh() {
  revalidatePath("/admin/bookings");
  revalidatePath("/admin/calendar");
  revalidatePath("/admin/requests");
  revalidatePath("/admin");
  revalidatePath("/admin/events");
}

// Every booking action here moves money or state, so it's owner/admin only.
// A limited user reaching an action (stale page, crafted POST) is turned away.
const NO_PERMISSION = "You don't have permission to manage bookings.";

// Preserve the caller's filters across a server action, so acting on a row
// doesn't dump the owner back to an unfiltered list.
function backTo(formData, extra = {}) {
  const p = new URLSearchParams();
  for (const k of ["status", "sort", "q", "space", "preset", "from", "to", "show", "pub", "day"]) {
    const v = formData.get(k);
    if (v) p.set(k, String(v));
  }
  for (const [k, v] of Object.entries(extra)) if (v) p.set(k, String(v));
  const s = p.toString();
  return "/admin/events" + (s ? `?${s}` : "");
}

export async function markPaid(formData) {
  if (!(await requireBookingManager())) redirect(backTo(formData, { toast: NO_PERMISSION, toastType: "error" }));
  const id = Number(formData.get("id"));
  await confirmBookingPaid(id, await getActor());
  refresh();
  redirect(backTo(formData, { toast: `Booking #${id} marked as paid.`, toastType: "success" }));
}

// Override: keep an unpaid hold on the calendar (stop it auto-expiring) while a
// deal is worked out, or re-arm the expiry to undo it.
export async function keepOnCalendar(formData) {
  if (!(await requireBookingManager())) redirect(backTo(formData, { toast: NO_PERMISSION, toastType: "error" }));
  const id = Number(formData.get("id"));
  const rearm = formData.get("rearm") === "1";
  const actor = await getActor();
  if (rearm) {
    reArmHold(id);
    logActivity({ bookingId: id, eventType: "hold_rearmed", description: "Payment window re-armed — hold can expire again", ...actor });
  } else {
    keepBookingOnCalendar(id);
    logActivity({ bookingId: id, eventType: "hold_kept", description: "Kept on the calendar — hold won't expire (deal)", ...actor });
  }
  refresh();
  redirect(backTo(formData, {
    toast: rearm ? `Booking #${id} will expire normally again.` : `Booking #${id} kept on the calendar — it won't expire.`,
    toastType: "success",
  }));
}

// Re-email the client their existing payment link.
/**
 * Put a booking on the public calendar, or take it off.
 *
 * The client ticks "list this on the public calendar" (or doesn't) when they
 * book, and nothing could change that afterwards: a booking that came in
 * private had no listing to edit and no way to get one. This fills that gap
 * from the owner's side.
 *
 * Three shapes, depending on where the booking is:
 *  - a listing already exists → just show or hide it (never delete: the host's
 *    description, photo and payment details survive a round trip)
 *  - paid, no listing → create it now and email the host their posting link,
 *    exactly as payment would have
 *  - not paid yet → set the flag only. confirmBookingPaid reads it, so payment
 *    creates the listing and sends the invite itself, with the right wording.
 */
export async function setBookingPublic(formData) {
  if (!(await requireBookingManager())) redirect(backTo(formData, { toast: NO_PERMISSION, toastType: "error" }));
  const id = Number(formData.get("id"));
  const makePublic = formData.get("public") === "1";
  const clicked = getBooking(id);
  if (!clicked) redirect(backTo(formData, { toast: "Booking not found.", toastType: "error" }));

  const result = await setBookingListingPublic({
    bookingId: clicked.id,
    makePublic,
    actor: await getActor(),
    via: "booking menu",
  });
  if (!result.ok) redirect(backTo(formData, { toast: result.error, toastType: "error" }));
  const toast = result.message;
  const toastType = result.tone;

  refresh();
  // refresh() only covers the admin tree; this is the one booking action that
  // changes what guests see, so the public pages need busting too.
  revalidatePath("/calendar");
  revalidatePath("/events");
  revalidatePath("/");
  redirect(backTo(formData, { toast, toastType }));
}

export async function sendRescheduleLink(formData) {
  if (!(await requireBookingManager())) redirect(backTo(formData, { toast: NO_PERMISSION, toastType: "error" }));
  const id = Number(formData.get("id"));
  const booking = getBooking(id);
  if (!booking) redirect(backTo(formData, { toast: "Booking not found.", toastType: "error" }));
  // Minting here is what lets an ALREADY-confirmed booking get a link: their
  // approval/confirmation email went out long before this feature existed.
  ensureRescheduleToken(id);
  const withToken = getBooking(id);
  let toast, toastType = "success";
  try {
    const res = await emailClientRescheduleLink(withToken);
    logEmail({
      bookingId: id,
      eventType: "reschedule_link_sent",
      description: "Change-date link sent to the client",
      recipientEmail: withToken.client_email,
      sendResult: res,
      ...(await getActor()),
    });
    toast = `Change-date link sent to ${withToken.client_email}.`;
  } catch (err) {
    console.error(`[bookings] reschedule link failed for #${id}:`, err.message);
    toast = "Couldn't send the change-date link.";
    toastType = "error";
  }
  refresh();
  redirect(backTo(formData, { toast, toastType }));
}

export async function resend(formData) {
  if (!(await requireBookingManager())) redirect(backTo(formData, { toast: NO_PERMISSION, toastType: "error" }));
  const id = Number(formData.get("id"));
  const result = await resendInvoice(id, await getActor());
  const toast =
    result?.error === "no_invoice"
      ? `Booking #${id} has no invoice to resend — approve it or reissue one first.`
      : result?.error === "already_paid"
        ? `Booking #${id} is already paid.`
        : result?.error
          ? `Couldn't resend booking #${id}.`
          : `Invoice resent to ${result.booking.client_email}.`;
  refresh();
  redirect(backTo(formData, { toast, toastType: result?.error ? "error" : "success" }));
}

// Ask Square whether the invoice has been paid; if so, confirm the booking.
export async function checkPayment(formData) {
  if (!(await requireBookingManager())) redirect(backTo(formData, { toast: NO_PERMISSION, toastType: "error" }));
  const id = Number(formData.get("id"));
  const b = getBooking(id);
  let toast = "No payment recorded yet.";
  let toastType = "neutral";
  if (b?.square_invoice_id) {
    try {
      const status = await getInvoiceStatus(b.square_invoice_id);
      if (status === "paid") {
        await confirmBookingPaid(id, await getActor());
        toast = `Payment found — booking #${id} is confirmed.`;
        toastType = "success";
      }
    } catch (err) {
      console.error("[bookings] check payment error:", err.message);
      toast = `Couldn't reach Square: ${err.message}`;
      toastType = "error";
    }
  }
  refresh();
  redirect(backTo(formData, { toast, toastType }));
}

// Restore a denied booking. Blocks (with a toast) if its buffered slot now
// conflicts with another held/confirmed booking; never silently double-books.
export async function restore(formData) {
  if (!(await requireBookingManager())) redirect(backTo(formData, { toast: NO_PERMISSION, toastType: "error" }));
  const id = Number(formData.get("id"));
  const to = formData.get("to") === "held" ? "held" : "pending";
  const booking = getBooking(id);
  if (!booking) redirect("/admin/events");

  const conflict = findRestoreConflict(booking);
  if (conflict) {
    const toast =
      conflict.kind === "closure"
        ? `Can't restore — ${spaceName(booking.space)} is closed on ${formatDate(booking.date)} at that time. Remove the closure first, or move the booking.`
        : `Can't restore — that slot now conflicts with ${conflict.booking.client_name} on ${formatDate(conflict.booking.date)} at ${formatTime(conflict.booking.start_time)} (${spaceName(conflict.booking.space)}). Resolve that booking first.`;
    redirect(backTo(formData, { toast, toastType: "error" }));
  }

  restoreBooking(id, to);
  logActivity({
    bookingId: id,
    eventType: "restored",
    description: `Restored from denied → ${to === "held" ? "held (approved)" : "pending"}`,
    metadata: { to },
    ...(await getActor()),
  });
  refresh();
  redirect(
    backTo(formData, {
      toast: `Booking #${id} restored to ${to === "held" ? "held (approved)" : "pending"}.`,
      toastType: "success",
    })
  );
}

export async function archive(formData) {
  if (!(await requireBookingManager())) redirect(backTo(formData, { toast: NO_PERMISSION, toastType: "error" }));
  const id = Number(formData.get("id"));
  const on = formData.get("on") !== "0";
  const actor = await getActor();
  if (on) archiveBooking(id);
  else unarchiveBooking(id);
  logActivity({
    bookingId: id,
    eventType: on ? "archived" : "unarchived",
    description: on ? "Archived — hidden from the bookings list" : "Restored from archive",
    ...actor,
  });
  refresh();
  redirect(
    backTo(formData, {
      toast: on
        ? `Booking #${id} archived. Find it under the Archived filter.`
        : `Booking #${id} is back in the list.`,
      toastType: "success",
    })
  );
}


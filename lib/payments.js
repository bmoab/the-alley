import { nanoid } from "nanoid";
import {
  getBooking,
  markBookingPaid,
  expireBooking,
  listExpiredHolds,
} from "./bookings.js";
import { createHostListingDraft } from "./catalog.js";
import {
  emailClientConfirmed,
  emailClientHoldExpired,
  emailHostInvite,
} from "./email.js";
import { logActivity, logEmail } from "./activity.js";
import { spaceName, formatDate, formatMoney } from "./constants.js";

const SYSTEM = { actorUserId: null, actorName: "system" };

/**
 * Orchestration for the payment → confirmation lifecycle (build priority 7).
 * Used by both the admin "mark as paid" action and the demo payment page so the
 * behavior is identical however payment is recorded.
 */

/**
 * Record payment for a held booking: confirm it, email the client, and — if the
 * booking was flagged as a public class/event — create the host-listing draft
 * and email the host their private posting link.
 */
export async function confirmBookingPaid(id, actor = SYSTEM) {
  const current = getBooking(id);
  if (!current) return null;
  if (current.payment_status === "paid" && current.status === "confirmed") {
    return current; // idempotent — already done
  }

  const booking = markBookingPaid(id);

  // Payment received. Attributed to whoever recorded it (an admin "Mark as
  // paid", or "system" for the Square webhook / client checkout).
  logActivity({
    bookingId: booking.id,
    eventType: "payment_received",
    description: `Payment received · ${formatMoney(booking.total)}`,
    amount: booking.total,
    ...actor,
  });

  try {
    const res = await emailClientConfirmed(booking);
    logEmail({
      bookingId: booking.id,
      eventType: "confirmation_sent",
      description: "Confirmation sent",
      recipientEmail: booking.client_email,
      sendResult: res,
    });

    if (booking.is_public_event) {
      const token = nanoid(24);
      createHostListingDraft(booking, token);
      const inviteRes = await emailHostInvite(booking, token);
      logEmail({
        bookingId: booking.id,
        eventType: "host_invite_sent",
        description: "Host listing invite sent",
        recipientEmail: booking.client_email,
        sendResult: inviteRes,
      });
    }
  } catch (err) {
    console.error("[payments] confirmation email error:", err.message);
  }

  return booking;
}

/**
 * Release any held bookings whose payment window has lapsed (reopens the slot)
 * and notify those clients. Returns the number released. Safe to call on each
 * admin page load (a cron would do this in production).
 */
export async function releaseExpiredHolds() {
  const expired = listExpiredHolds();
  for (const b of expired) {
    expireBooking(b.id);
    logActivity({
      bookingId: b.id,
      eventType: "hold_expired",
      description: `Hold expired — ${spaceName(b.space)} on ${formatDate(b.date)} reopened`,
      ...SYSTEM,
    });
    try {
      const res = await emailClientHoldExpired(b);
      logEmail({
        bookingId: b.id,
        eventType: "hold_expired_sent",
        description: "Hold-expired notice sent",
        recipientEmail: b.client_email,
        sendResult: res,
      });
    } catch (err) {
      console.error("[payments] hold-expired email error:", err.message);
    }
  }
  return expired.length;
}

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
export async function confirmBookingPaid(id, actor = SYSTEM, { comped, notify = true } = {}) {
  const current = getBooking(id);
  if (!current) return null;
  if (current.payment_status === "paid" && current.status === "confirmed") {
    return current; // idempotent — already done
  }

  const booking = markBookingPaid(id);
  // A $0 booking was never invoiced, so no payment can have arrived — treat it
  // as comped however we got here (admin "Mark as paid", the series cron, …)
  // unless the caller says otherwise.
  const isComped = comped ?? Number(booking.total) === 0;

  // Payment received. Attributed to whoever recorded it (an admin "Mark as
  // paid", or "system" for the Square webhook / client checkout). A comped
  // booking never had an invoice, so it logs as a waiver rather than a payment.
  logActivity({
    bookingId: booking.id,
    eventType: isComped ? "comped" : "payment_received",
    description: isComped
      ? "Booked free of charge · no invoice sent"
      : `Payment received · ${formatMoney(booking.total)}`,
    amount: booking.total,
    ...actor,
  });

  try {
    // notify=false is for a comped series, where one approval email already
    // covers every session — a per-session confirmation would be spam.
    if (notify) {
      const res = await emailClientConfirmed(booking);
      logEmail({
        bookingId: booking.id,
        eventType: "confirmation_sent",
        description: "Confirmation sent",
        recipientEmail: booking.client_email,
        sendResult: res,
      });
    }

    // For a recurring series, only the holder (first session) triggers the
    // single public-calendar listing invite — not every paid session.
    if (booking.is_public_event && (!booking.series_id || booking.is_deposit_holder)) {
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

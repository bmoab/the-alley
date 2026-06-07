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
export async function confirmBookingPaid(id) {
  const current = getBooking(id);
  if (!current) return null;
  if (current.payment_status === "paid" && current.status === "confirmed") {
    return current; // idempotent — already done
  }

  const booking = markBookingPaid(id);

  try {
    await emailClientConfirmed(booking);

    if (booking.is_public_event) {
      const token = nanoid(24);
      createHostListingDraft(booking, token);
      await emailHostInvite(booking, token);
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
    try {
      await emailClientHoldExpired(b);
    } catch (err) {
      console.error("[payments] hold-expired email error:", err.message);
    }
  }
  return expired.length;
}

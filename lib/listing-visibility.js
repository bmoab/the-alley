import { nanoid } from "nanoid";
import { getBooking, getSeries, setBookingPublicFlag } from "./bookings.js";
import {
  createHostListingDraft,
  getDraftEventForBooking,
  setEventStatus,
} from "./catalog.js";
import { emailHostInvite } from "./email.js";
import { logActivity, logEmail } from "./activity.js";

/**
 * Put a BOOKING on the public calendar, or take it off.
 *
 * Distinct from setEventStatus(), which flips a listing that already exists.
 * A booking may have no listing at all — most don't; a private party never
 * wants one — and in that case "make this public" has to create the listing
 * first. That gap was the confusing part: a booking with no listing appears
 * NOWHERE on the Public Events page (it only lists listings), so there was no
 * screen where you could act on it except the booking's own ⋯ menu.
 *
 * Shared by that menu and the booking drawer so the two can't drift.
 */
export async function setBookingListingPublic({ bookingId, makePublic, actor, via = null }) {
  const clicked = getBooking(bookingId);
  if (!clicked) return { ok: false, error: "Booking not found." };

  // A series has ONE listing, hanging off its holder session and fanned out
  // across the rest, so resolve to that row however the caller got here.
  const booking = clicked.series_id
    ? getSeries(clicked.series_id).find((r) => r.is_deposit_holder) || clicked
    : clicked;

  setBookingPublicFlag(booking.id, makePublic);
  const existing = getDraftEventForBooking(booking.id);
  const who = booking.client_name || `Booking #${booking.id}`;

  if (!makePublic) {
    // setEventStatus writes its own activity entry — don't log it twice.
    if (existing) setEventStatus(existing.id, "private", { actor, via });
    return {
      ok: true,
      status: "private",
      created: false,
      emailed: false,
      tone: "neutral",
      message: `${who} is private — off the public calendar.`,
    };
  }

  if (existing) {
    setEventStatus(existing.id, "live", { actor, via });
    return {
      ok: true,
      status: "live",
      created: false,
      emailed: false,
      tone: "success",
      message: `${who} is on the public calendar.`,
    };
  }

  // Nothing to publish yet. A listing is only worth creating once the booking
  // is actually paid for — before that the confirmation email carries the
  // host's posting link anyway.
  if (booking.payment_status !== "paid") {
    return {
      ok: true,
      status: null,
      created: false,
      emailed: false,
      tone: "neutral",
      message: `${who} will be listed publicly once they pay — their posting link goes out with the confirmation.`,
    };
  }

  const listing = createHostListingDraft(booking, nanoid(24));
  // createHostListingDraft INSERTs at 'live' rather than going through
  // setEventStatus, so this is the one path that has to log for itself.
  logActivity({
    bookingId: booking.id,
    eventType: "listing_visibility_changed",
    description:
      `"${listing.title || who}" published to the public calendar` + (via ? ` (${via})` : ""),
    actorUserId: actor?.actorUserId ?? null,
    actorName: actor?.actorName || "system",
    metadata: { event_id: listing.id, from: null, to: "live", via, created: true },
  });

  let emailed = false;
  let message = `${who} is on the public calendar.`;
  let tone = "success";

  if (booking.client_email) {
    try {
      const res = await emailHostInvite(booking, listing.host_token);
      logEmail({
        bookingId: booking.id,
        eventType: "host_invite_sent",
        description: "Host listing invite sent",
        recipientEmail: booking.client_email,
        sendResult: res,
        ...actor,
      });
      emailed = true;
      message = `${who} is on the public calendar — posting link emailed to them.`;
    } catch (err) {
      console.error(`[listings] host invite failed for #${booking.id}:`, err.message);
      message = `${who} is on the calendar, but the posting link email failed — send it from Public Events.`;
      tone = "neutral";
    }
  } else {
    message = `${who} is on the public calendar. No email on file — copy their posting link from Public Events.`;
    tone = "neutral";
  }

  return { ok: true, status: "live", created: true, emailed, listingId: listing.id, tone, message };
}

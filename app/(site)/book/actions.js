"use server";

import { isSlotAvailable, isStartInPast, createBookingRequest, getBooking } from "@/lib/bookings.js";
import { isClosedForBooking } from "@/lib/closures.js";
import { getSetting } from "@/lib/db.js";
import { SPACE_BY_ID, EVENT_TYPES, GUEST_RANGES } from "@/lib/constants.js";
import { emailOwnerNewRequest, emailClientReceived } from "@/lib/email.js";
import { logActivity, logEmail } from "@/lib/activity.js";

const OWNER_EMAIL = process.env.OWNER_EMAIL || "thealleyoncenter@gmail.com";

/**
 * Validate and persist a booking request (status = pending).
 * Returns { ok: true, id } or { ok: false, error }.
 */
export async function submitBooking(payload) {
  const errors = [];

  const space = payload.space;
  if (!space || !SPACE_BY_ID[space]) errors.push("Please choose a space.");

  const date = payload.date;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.push("Please choose a date.");

  const start_time = payload.start_time;
  if (!start_time || !/^\d{2}:\d{2}$/.test(start_time)) errors.push("Please choose a start time.");

  const minHours = Number(getSetting("minimum_hours", "2"));
  const hours = Number(payload.hours);
  if (!hours || hours < minHours) errors.push(`Minimum booking is ${minHours} hours.`);
  if (hours > 8) errors.push("Maximum booking is 8 hours.");

  if (!payload.client_name?.trim()) errors.push("Your name is required.");
  if (!payload.client_email?.trim()) errors.push("Your email is required.");
  if (!payload.client_phone?.trim()) errors.push("Your phone number is required.");
  if (!payload.agreed) errors.push("Please agree to the rental terms.");

  if (payload.event_type && !EVENT_TYPES.includes(payload.event_type)) {
    errors.push("Invalid event type.");
  }
  if (payload.guests && !GUEST_RANGES.includes(payload.guests)) {
    errors.push("Invalid guest range.");
  }

  if (errors.length) return { ok: false, error: errors.join(" ") };

  // Can't book a time that's already passed today.
  if (isStartInPast(date, start_time)) {
    return { ok: false, error: "That start time has already passed today — please pick a later time." };
  }

  // Closed by the owner?
  const [sh, sm] = start_time.split(":").map(Number);
  const startHour = sh + (sm || 0) / 60;
  if (isClosedForBooking(space, date, startHour, startHour + hours)) {
    return { ok: false, error: "The Alley is closed at that time — please pick another time or date." };
  }

  // Authoritative double-booking check at submit time.
  if (!isSlotAvailable(space, date, start_time, hours)) {
    return {
      ok: false,
      error:
        "Sorry — that time was just taken for this space. Please pick another start time.",
    };
  }

  const id = createBookingRequest({
    space,
    date,
    start_time,
    hours,
    client_name: payload.client_name.trim(),
    client_email: payload.client_email.trim(),
    client_phone: payload.client_phone.trim(),
    event_type: payload.event_type || null,
    guests: payload.guests || null,
    alcohol: !!payload.alcohol,
    notes: payload.notes?.trim() || null,
    is_recurring: !!payload.is_recurring,
    recurring_schedule: payload.is_recurring ? payload.recurring_schedule?.trim() || null : null,
    is_public_event: !!payload.is_public_event,
  });

  // Notify the owner and acknowledge the client. (Emails log to the console
  // when no provider is configured.)
  const booking = getBooking(id);

  // Activity: request submitted (attributed to the client who submitted it).
  logActivity({
    bookingId: booking.id,
    eventType: "request_submitted",
    description: `Request submitted by ${booking.client_name}`,
    actorUserId: null,
    actorName: booking.client_name,
  });

  try {
    const [ownerRes, clientRes] = await Promise.all([
      emailOwnerNewRequest(booking),
      emailClientReceived(booking),
    ]);
    logEmail({
      bookingId: booking.id,
      eventType: "owner_notified",
      description: "Owner notified of new request",
      recipientEmail: OWNER_EMAIL,
      sendResult: ownerRes,
    });
    logEmail({
      bookingId: booking.id,
      eventType: "client_received",
      description: "Request acknowledgment sent",
      recipientEmail: booking.client_email,
      sendResult: clientRes,
    });
  } catch (err) {
    console.error("[booking] email send error:", err.message);
  }

  return { ok: true, id: Number(id) };
}

"use server";

import { isSlotAvailable, isStartTooSoon, createBookingRequest, createBookingSeries, getSeries, getBooking } from "@/lib/bookings.js";
import { isClosedForBooking } from "@/lib/closures.js";
import { getSetting } from "@/lib/db.js";
import { SPACE_BY_ID, EVENT_TYPES, GUEST_RANGES } from "@/lib/constants.js";
import { emailOwnerNewRequest, emailClientReceived, emailOwnerNewSeriesRequest, emailClientSeriesReceived } from "@/lib/email.js";
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
  const maxHours = Number(getSetting("maximum_hours", "8")) || 8;
  const hours = Number(payload.hours);
  if (!hours || hours < minHours) errors.push(`Minimum booking is ${minHours} hours.`);
  if (hours > maxHours) errors.push(`Maximum booking is ${maxHours} hours.`);

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

  // Can't book a time that's already passed, or inside the advance-notice window.
  if (isStartTooSoon(date, start_time)) {
    const leadHours = Number(getSetting("min_lead_hours", "0")) || 0;
    return {
      ok: false,
      error:
        leadHours > 0
          ? `Bookings must be made at least ${leadHours} hours in advance — please pick a later time.`
          : "That start time has already passed — please pick a later time.",
    };
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
    event_title: payload.event_title?.trim() || null,
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

/**
 * Validate and persist a recurring booking series (N linked `pending` rows).
 * All sessions share one space, start time and duration; only the date varies.
 * Re-checks every date server-side and returns { ok:false, conflicts:[{date,
 * reason}] } if any are unavailable (the client adjusts before resubmitting),
 * otherwise creates the series. Returns { ok:true, seriesId, count }.
 */
export async function submitBookingSeries(payload) {
  const errors = [];

  const space = payload.space;
  if (!space || !SPACE_BY_ID[space]) errors.push("Please choose a space.");

  const start_time = payload.start_time;
  if (!start_time || !/^\d{2}:\d{2}$/.test(start_time)) errors.push("Please choose a start time.");

  const minHours = Number(getSetting("minimum_hours", "2"));
  const maxHours = Number(getSetting("maximum_hours", "8")) || 8;
  const hours = Number(payload.hours);
  if (!hours || hours < minHours) errors.push(`Minimum booking is ${minHours} hours.`);
  if (hours > maxHours) errors.push(`Maximum booking is ${maxHours} hours.`);

  if (!payload.client_name?.trim()) errors.push("Your name is required.");
  if (!payload.client_email?.trim()) errors.push("Your email is required.");
  if (!payload.client_phone?.trim()) errors.push("Your phone number is required.");
  if (!payload.agreed) errors.push("Please agree to the rental terms.");

  if (payload.event_type && !EVENT_TYPES.includes(payload.event_type)) errors.push("Invalid event type.");
  if (payload.guests && !GUEST_RANGES.includes(payload.guests)) errors.push("Invalid guest range.");

  // Normalize, de-dupe and sort the requested dates.
  const dates = Array.from(
    new Set((payload.dates || []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))
  ).sort();
  const maxOcc = Number(getSetting("series_max_occurrences", "8")) || 8;
  const maxSpan = Number(getSetting("series_max_span_days", "31")) || 31;
  if (dates.length < 2) errors.push("A recurring booking needs at least 2 dates.");
  if (dates.length > maxOcc) errors.push(`A recurring booking can have at most ${maxOcc} sessions.`);
  if (dates.length >= 2) {
    const spanDays = Math.round(
      (Date.parse(dates[dates.length - 1]) - Date.parse(dates[0])) / 86400000
    );
    if (spanDays > maxSpan) errors.push(`Recurring sessions must fall within ${maxSpan} days.`);
  }

  if (errors.length) return { ok: false, error: errors.join(" ") };

  // Authoritative per-date availability check.
  const [sh, sm] = start_time.split(":").map(Number);
  const startHour = sh + (sm || 0) / 60;
  const conflicts = [];
  for (const date of dates) {
    if (isStartTooSoon(date, start_time)) conflicts.push({ date, reason: "Too soon" });
    else if (isClosedForBooking(space, date, startHour, startHour + hours)) conflicts.push({ date, reason: "Closed" });
    else if (!isSlotAvailable(space, date, start_time, hours)) conflicts.push({ date, reason: "Taken" });
  }
  if (conflicts.length) {
    return {
      ok: false,
      conflicts,
      error: "Some of your dates are no longer available — adjust them and try again.",
    };
  }

  const { seriesId } = createBookingSeries(
    {
      space,
      client_name: payload.client_name.trim(),
      client_email: payload.client_email.trim(),
      client_phone: payload.client_phone.trim(),
      event_title: payload.event_title?.trim() || null,
      event_type: payload.event_type || null,
      guests: payload.guests || null,
      alcohol: !!payload.alcohol,
      notes: payload.notes?.trim() || null,
      recurring_schedule: payload.recurring_schedule?.trim() || null,
      is_public_event: !!payload.is_public_event,
    },
    dates.map((date) => ({ date, start_time, hours }))
  );

  const rows = getSeries(seriesId);
  const holder = rows[0];

  logActivity({
    bookingId: holder.id,
    eventType: "request_submitted",
    description: `Recurring request (${rows.length} sessions) submitted by ${holder.client_name}`,
    actorUserId: null,
    actorName: holder.client_name,
  });

  try {
    const [ownerRes, clientRes] = await Promise.all([
      emailOwnerNewSeriesRequest(holder, rows),
      emailClientSeriesReceived(holder, rows),
    ]);
    logEmail({
      bookingId: holder.id,
      eventType: "owner_notified",
      description: "Owner notified of new recurring request",
      recipientEmail: OWNER_EMAIL,
      sendResult: ownerRes,
    });
    logEmail({
      bookingId: holder.id,
      eventType: "client_received",
      description: "Recurring request acknowledgment sent",
      recipientEmail: holder.client_email,
      sendResult: clientRes,
    });
  } catch (err) {
    console.error("[booking] series email send error:", err.message);
  }

  return { ok: true, seriesId: Number(seriesId), count: rows.length };
}

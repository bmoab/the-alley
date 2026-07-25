import { formatTime } from "./constants.js";

/**
 * Guest-facing event times.
 *
 * An event's `time` mirrors the booking's start — which is when the RESERVATION
 * begins, not when guests should arrive. Hosts are told to book their setup
 * time, so someone who runs a 6–9 PM class correctly books from 5 PM, and the
 * calendar then advertised 5 PM. `public_time` / `public_end_time` carry what
 * the public should see; both are optional and never touch the booking, the
 * room block, or the invoice.
 *
 * Precedence for the displayed time:
 *   1. public_time (+ public_end_time when set)
 *   2. end_label — legacy free-text override ("6–9 PM"), kept so existing rows
 *      render exactly as they did
 *   3. time — the reservation start
 *
 * Pure module (no DB): safe to import from client components.
 */

/** True for a well-formed "HH:MM" 24-hour string. */
export function isTime(value) {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value);
}

/** "HH:MM" → minutes since midnight, or null. */
export function toMinutes(value) {
  if (!isTime(value)) return null;
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

/** Minutes since midnight → "HH:MM", clamped to the same day. */
export function toTimeString(mins) {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(mins)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** When guests should arrive: the public override, else the reservation start. */
export function eventPublicStart(event) {
  if (!event) return null;
  return isTime(event.public_time) ? event.public_time : event.time || null;
}

/** When the event ends for guests, or null if the host didn't say. */
export function eventPublicEnd(event) {
  if (!event) return null;
  return isTime(event.public_end_time) ? event.public_end_time : null;
}

/**
 * The time to show on the calendar, event cards, and the listing page —
 * "6:00 PM", "6:00 PM – 9:00 PM", or "" when the event has no time at all.
 */
export function eventTimeLabel(event) {
  if (!event) return "";
  const start = eventPublicStart(event);
  const end = eventPublicEnd(event);
  // A host-set public time is the most specific answer — prefer it over the
  // legacy free-text label.
  if (isTime(event.public_time)) {
    return end ? `${formatTime(start)} – ${formatTime(end)}` : formatTime(start);
  }
  if (event.end_label) return event.end_label;
  if (end && start) return `${formatTime(start)} – ${formatTime(end)}`;
  return start ? formatTime(start) : "";
}

/**
 * The window the host actually has the room for: { start, end } as "HH:MM",
 * from the booking's start_time + hours. `end` is clamped to the same day.
 */
export function reservationWindow(startTime, hours) {
  const startMins = toMinutes(startTime);
  const h = Number(hours);
  if (startMins == null || !Number.isFinite(h) || h <= 0) return null;
  return { start: startTime, end: toTimeString(startMins + h * 60) };
}

/**
 * Validate guest-facing times against the reservation window.
 * Returns { public_time, public_end_time } to store (either may be null), or
 * { error } describing the first problem. With no window (the Alley's own
 * events, which have no booking), only internal consistency is checked.
 */
export function validatePublicTimes({ publicTime, publicEndTime, window: win }) {
  const start = isTime(publicTime) ? publicTime : null;
  const end = isTime(publicEndTime) ? publicEndTime : null;

  if (end && !start) {
    return { error: "Add a start time for guests before setting an end time." };
  }
  if (start && end && toMinutes(end) <= toMinutes(start)) {
    return { error: "The end time has to be after the start time." };
  }
  if (win) {
    const lo = toMinutes(win.start);
    const hi = toMinutes(win.end);
    if (start && toMinutes(start) < lo) {
      return {
        error: `You have the room from ${formatTime(win.start)} — guests can't be told to arrive before that.`,
      };
    }
    if (end && toMinutes(end) > hi) {
      return {
        error: `Your booking ends at ${formatTime(win.end)} — the event can't run past that.`,
      };
    }
  }
  return { public_time: start, public_end_time: start ? end : null };
}

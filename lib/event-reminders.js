/**
 * "Happening soon" digests for whoever runs the building.
 *
 * The gap this fills: nothing in the system ever told the owner about a booking
 * that isn't on the public calendar. Public events at least show up on /calendar;
 * a private rental was invisible unless someone went looking in admin. So this
 * reports EVERYTHING on a given day and tags each line public or private.
 *
 * Two windows, both sent from one daily cron run:
 *   - "lead"  — the date `event_reminder_lead_days` ahead (default 2)
 *   - "today" — this morning's rundown
 *
 * Dedupe is a settings key rather than a per-row column (as in
 * runPendingRequestReminder) because this is one email per day, not one per
 * booking. A day with nothing on it sends no email at all.
 */

import { db, getSetting, setSetting } from "./db.js";
import { BLOCKING_STATUSES, venueToday, shiftDate, spaceName } from "./constants.js";
import { emailOwnerUpcomingEvents } from "./email.js";
import { reminderRecipients, recipientLabel } from "./notify.js";
import { logEmail } from "./activity.js";

const SYSTEM_ACTOR = { actorUserId: null, actorName: "system" };

export const REMINDER_WINDOWS = {
  lead: { key: "event_reminder_lead_last_sent" },
  today: { key: "event_reminder_today_last_sent" },
};

/** How many days ahead the advance digest looks. */
export function reminderLeadDays() {
  return Number(getSetting("event_reminder_lead_days", "2")) || 2;
}

/**
 * Everything happening on a venue date: real bookings plus the Alley's own
 * calendar events (which have no booking behind them).
 *
 * `pending` is deliberately excluded — an unapproved request isn't a commitment,
 * and the pending-requests cron already nags about those daily.
 */
export function listHappeningOn(date) {
  const placeholders = BLOCKING_STATUSES.map(() => "?").join(",");
  const bookings = db
    .prepare(
      `SELECT b.*,
              e.id     AS event_id,
              e.title  AS event_listing_title,
              e.status AS event_status
         FROM bookings b
         LEFT JOIN events e
                ON e.booking_id = b.id AND e.status = 'live'
        WHERE b.date = ?
          AND b.archived = 0
          AND b.status IN (${placeholders})
        ORDER BY b.start_time ASC`
    )
    .all(date, ...BLOCKING_STATUSES);

  const items = bookings.map((b) => ({
    kind: "booking",
    bookingId: b.id,
    title: b.session_title || b.event_title || b.event_listing_title || null,
    name: b.client_name,
    phone: b.client_phone,
    email: b.client_email,
    space: b.space,
    spaceLabel: spaceName(b.space),
    startTime: b.start_time,
    hours: Number(b.hours) || 0,
    status: b.status,
    paid: b.payment_status === "paid",
    guests: b.guests || null,
    // The answer to "what's happening that ISN'T on the public calendar?"
    isPublic: !!b.event_id,
  }));

  // The Alley's own programming — no booking row behind it.
  const ownEvents = db
    .prepare(
      `SELECT * FROM events
        WHERE booking_id IS NULL AND status = 'live' AND date = ?
        ORDER BY COALESCE(public_time, time) ASC`
    )
    .all(date);

  for (const e of ownEvents) {
    items.push({
      kind: "event",
      bookingId: null,
      eventId: e.id,
      title: e.title || "Alley event",
      name: e.host_name || "The Alley",
      phone: null,
      email: e.host_email || null,
      space: e.space,
      spaceLabel: e.space ? spaceName(e.space) : "The Alley",
      startTime: e.public_time || e.time || null,
      hours: null,
      status: "live",
      paid: null,
      guests: null,
      isPublic: true,
    });
  }

  items.sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
  return items;
}

/**
 * Send one window's digest if it has anything to report and hasn't already gone
 * out today. Returns a small summary rather than throwing, so the cron route can
 * report on both windows in one response.
 */
async function runWindow(window, date, today, { force = false } = {}) {
  const dedupeKey = REMINDER_WINDOWS[window].key;
  const items = listHappeningOn(date);
  if (!items.length) return { skipped: "nothing_on", date, count: 0 };
  if (!force && getSetting(dedupeKey) === today) {
    return { skipped: "already_sent_today", date, count: items.length };
  }

  const res = await emailOwnerUpcomingEvents(items, { window, date });
  setSetting(dedupeKey, today);
  logEmail({
    bookingId: null,
    eventType: "upcoming_reminder_sent",
    description:
      window === "today"
        ? `Today's rundown sent · ${items.length} on the calendar`
        : `Upcoming-events reminder sent · ${items.length} on ${date}`,
    recipientEmail: recipientLabel(reminderRecipients()),
    sendResult: res,
    ...SYSTEM_ACTOR,
  });
  return { ok: true, date, count: items.length };
}

/**
 * Both digests, from one daily run. Idempotent within a day; safe to call
 * repeatedly. `force` bypasses the once-a-day guard (not the nothing-on skip).
 */
export async function runUpcomingEventReminders({ now = new Date(), force = false } = {}) {
  const today = venueToday(now);
  const leadDate = shiftDate(today, { days: reminderLeadDays() });

  const out = {};
  for (const [window, date] of [["lead", leadDate], ["today", today]]) {
    try {
      out[window] = await runWindow(window, date, today, { force });
    } catch (err) {
      console.error(`[event-reminders] ${window} digest failed:`, err.message);
      out[window] = { error: err.message, date };
    }
  }
  return out;
}

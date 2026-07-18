import { db } from "./db.js";
import { venueToday } from "./constants.js";
import { emailHostReminder } from "./email.js";
import { logEmail } from "./activity.js";

// How the automatic host-details nudge is paced. A placeholder listing whose
// host hasn't posted gets reminded every ~3 days, and we stop once the event is
// within a couple of days (too late to matter) or has passed.
const RESEND_AFTER_DAYS = 3;
const STOP_WITHIN_DAYS = 2;
const MS_PER_DAY = 86400000;

const SYSTEM_ACTOR = { actorUserId: null, actorName: "system" };

/**
 * Live placeholder listings that are due for an automatic host-details nudge:
 * host hasn't posted, we have an email + private link, the event is still more
 * than a couple of days out, and it's been at least ~3 days since the last
 * reminder (manual or automatic — both stamp `host_reminder_last_sent`).
 */
export function listHostRemindersDue(now = new Date()) {
  // Event must be strictly later than this date → at least a few days out.
  const minEventDate = venueToday(new Date(now.getTime() + STOP_WITHIN_DAYS * MS_PER_DAY));
  // Last reminder must be on/before this date → at least ~3 days ago.
  const resentCutoff = venueToday(new Date(now.getTime() - RESEND_AFTER_DAYS * MS_PER_DAY));
  return db
    .prepare(
      `SELECT * FROM events
        WHERE status = 'live'
          AND host_posted = 0
          AND host_token IS NOT NULL
          AND host_email IS NOT NULL AND host_email != ''
          AND date IS NOT NULL AND date > ?
          AND (host_reminder_last_sent IS NULL OR host_reminder_last_sent <= ?)
        ORDER BY date ASC`
    )
    .all(minEventDate, resentCutoff);
}

/**
 * Email each due host their "finish your listing" nudge and stamp the send so
 * they aren't reminded again for ~3 days. Idempotent within a day; safe to call
 * repeatedly. Returns the number of reminders actually sent.
 */
export async function runHostDetailReminders(now = new Date()) {
  const today = venueToday(now);
  const due = listHostRemindersDue(now);
  let sent = 0;
  for (const ev of due) {
    try {
      const res = await emailHostReminder(ev);
      db.prepare("UPDATE events SET host_reminder_last_sent = ? WHERE id = ?").run(today, ev.id);
      logEmail({
        bookingId: ev.booking_id || null,
        eventType: "host_reminder_sent",
        description: `Host-details reminder auto-sent${ev.title ? ` · ${ev.title}` : ""}`,
        recipientEmail: ev.host_email,
        sendResult: res,
        ...SYSTEM_ACTOR,
      });
      sent++;
    } catch (err) {
      console.error(`[host-reminders] failed for event #${ev.id}:`, err.message);
    }
  }
  return sent;
}

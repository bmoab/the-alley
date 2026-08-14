/**
 * Where the Alley's own notifications go.
 *
 * Owner-facing mail used to be addressed to a single module-level constant read
 * from OWNER_EMAIL at import time, which meant changing it needed a deploy.
 * Now the address book lives in `settings` so it's editable in admin, split by
 * purpose: requests/approvals go to whoever can actually act on them, while
 * upcoming-event reminders can go to a wider list.
 *
 * Every lookup falls back to the env var and then to the Alley's Gmail, so a
 * cleared or fat-fingered box degrades to "someone real gets it" rather than
 * mail silently going nowhere.
 */

import { getSetting } from "./db.js";

const ENV_OWNER = process.env.OWNER_EMAIL || "thealleyoncenter@gmail.com";

// Deliberately loose: we're filtering out obvious junk (stray words, half-typed
// addresses), not validating deliverability. Resend is the real judge of that.
const LOOKS_LIKE_EMAIL = /^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/;

/** "a@b.com, c@d.com" (or newline/semicolon separated) → ["a@b.com", "c@d.com"]. */
export function parseList(raw) {
  return String(raw ?? "")
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter((s) => LOOKS_LIKE_EMAIL.test(s));
}

/**
 * The address list stored under `key`, or the env fallback when that setting is
 * empty/missing/garbage. Never returns an empty array.
 */
export function notifyList(key) {
  const list = parseList(getSetting(key, ""));
  return list.length ? list : parseList(ENV_OWNER);
}

/** Who hears about new requests, deposits to resolve, and client-made changes. */
export function requestRecipients() {
  return notifyList("notify_requests");
}

/** Who gets the "happening soon" digests. Usually a wider list. */
export function reminderRecipients() {
  return notifyList("notify_reminders");
}

/**
 * Where a client's reply lands. The From address is a no-reply-ish bookings@,
 * so this has to point at an inbox someone actually reads.
 */
export function replyToAddress() {
  const setting = String(getSetting("reply_to_email", "") ?? "").trim();
  if (LOOKS_LIKE_EMAIL.test(setting)) return setting;
  return process.env.EMAIL_REPLY_TO || ENV_OWNER;
}

/** Recipient lists are logged to a TEXT column — join before handing them over. */
export function recipientLabel(list) {
  return (Array.isArray(list) ? list : [list]).join(", ");
}

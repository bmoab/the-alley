/**
 * Identity for the client portal — the private "all my bookings" link.
 *
 * Every other self-service token in this app hangs off the single row it edits:
 * a booking (reschedule_token), a listing (host_token), a directory or
 * exhibitor entry (edit_token). This one can't, because it spans every booking
 * one person has ever made. So the email address IS the identity, and the token
 * is its credential, in a table of their own.
 *
 * ⚠️ Deliberately imports nothing but the database. `lib/email.js` needs this
 * module to put the link in its templates, and `lib/bookings.js` imports
 * `lib/email.js` — so reaching for bookings from here would close the loop
 * email → portal → bookings → email. The booking queries live in bookings.js;
 * this file only ever answers "who is this token, and what's the token for
 * this address".
 */

import { nanoid } from "nanoid";
import { db } from "./db.js";

/**
 * Nothing normalizes client_email on the way in, so the same person can be
 * "Sam@Example.com " on one booking and "sam@example.com" on the next. Every
 * comparison here folds both.
 */
export function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

/**
 * This address's portal token, minted on first use.
 *
 * Lazily, exactly like ensureRescheduleToken: backfilling the whole bookings
 * table would mint live credentials for everyone who booked once years ago and
 * will never be sent the link. A token comes into existence when an email that
 * carries it is actually being composed.
 *
 * INSERT OR IGNORE + re-select rather than check-then-insert, so two emails
 * composed for the same client at the same moment can't race into a UNIQUE
 * violation — whichever lands first wins and both return the same token.
 */
export function ensureClientPortalToken(email) {
  const clean = normalizeEmail(email);
  if (!clean) return null;
  db.prepare("INSERT OR IGNORE INTO client_portals (email, token) VALUES (?, ?)").run(
    clean,
    nanoid(24)
  );
  return db.prepare("SELECT token FROM client_portals WHERE email = ?").get(clean)?.token ?? null;
}

/** The portal row a token belongs to, or undefined. The only way in. */
export function getClientPortalByToken(token) {
  const clean = String(token ?? "").trim();
  if (!clean) return undefined;
  return db.prepare("SELECT * FROM client_portals WHERE token = ?").get(clean);
}

/** Record that the link was opened — lets the owner see if it's being used. */
export function touchClientPortal(id) {
  db.prepare("UPDATE client_portals SET last_seen_at = datetime('now') WHERE id = ?").run(id);
}

/**
 * Past clients who should be told their dashboard exists, and haven't been yet.
 *
 * Deliberately raw SQL rather than reaching for lib/bookings.js — see the note
 * at the top of this file about the email → portal → bookings → email loop.
 *
 * Only people whose dashboard would actually show them something: at least one
 * non-archived booking that got somewhere. Denied-only and expired-only
 * addresses are left out, because "see all your bookings" landing on an empty
 * page (or one row reading "not going ahead") is a worse first impression than
 * no email at all.
 */
const ANNOUNCE_STATUSES = ["pending", "held", "reserved", "confirmed", "completed", "cancelled"];

export function listAnnouncementRecipients({ limit = null } = {}) {
  const placeholders = ANNOUNCE_STATUSES.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT t.email, t.bookings, t.last_booked,
              (SELECT x.client_name FROM bookings x
                WHERE lower(trim(x.client_email)) = t.email
                ORDER BY x.created_at DESC, x.id DESC LIMIT 1) AS name
         FROM (
           SELECT lower(trim(b.client_email)) AS email,
                  COUNT(*)                    AS bookings,
                  MAX(b.created_at)           AS last_booked
             FROM bookings b
            WHERE b.archived = 0
              AND TRIM(COALESCE(b.client_email, '')) != ''
              AND b.status IN (${placeholders})
            GROUP BY lower(trim(b.client_email))
         ) t
         LEFT JOIN client_portals p ON p.email = t.email
        WHERE p.announced_at IS NULL
        ORDER BY t.last_booked DESC`
    )
    .all(...ANNOUNCE_STATUSES);
  return limit ? rows.slice(0, limit) : rows;
}

/** How many past clients are still waiting to hear about it. */
export function countAnnouncementRecipients() {
  return listAnnouncementRecipients().length;
}

/**
 * Stamp one address as told. Called immediately after its send succeeds, not
 * at the end of the batch — a crash halfway through must not re-mail everyone
 * who already got it.
 */
export function markAnnounced(email) {
  const clean = normalizeEmail(email);
  if (!clean) return;
  db.prepare("UPDATE client_portals SET announced_at = datetime('now') WHERE email = ?").run(clean);
}

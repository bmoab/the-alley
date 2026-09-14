/**
 * The one-off "your bookings dashboard exists now" announcement to past clients.
 *
 * This is the only place in the app that sends mail to many people at once, so
 * it's deliberately cautious:
 *  - nobody is mailed twice (client_portals.announced_at, stamped per send)
 *  - a send that fails is NOT stamped, so the next run picks it up again
 *  - it goes out in batches, because a server action that runs for minutes gets
 *    killed by the platform's request timeout halfway through
 *  - the owner sees the recipient count and a sample before anything leaves
 */

import { emailClientPortalAnnouncement } from "./email.js";
import {
  listAnnouncementRecipients,
  countAnnouncementRecipients,
  ensureClientPortalToken,
  markAnnounced,
} from "./portal.js";
import { logActivity } from "./activity.js";

// Resend's default ceiling is ~2 requests/second. 500ms leaves margin without
// making a realistic list (dozens, not thousands) take all afternoon.
const GAP_MS = 500;

/** Most one click will send. At GAP_MS apart that's ~20s — safely inside a request. */
export const ANNOUNCE_BATCH = 40;

/** Who would be mailed, without minting a token or sending anything. */
export function previewAnnouncement({ sample = 8 } = {}) {
  const all = listAnnouncementRecipients();
  return { total: all.length, sample: all.slice(0, sample) };
}

/**
 * Send the next batch. Returns { sent, failed, remaining } so the caller can
 * tell the owner what happened and whether to click again.
 */
export async function runPortalAnnouncement({ batch = ANNOUNCE_BATCH, actor = {} } = {}) {
  const due = listAnnouncementRecipients({ limit: batch });
  const failed = [];
  let sent = 0;

  for (let i = 0; i < due.length; i++) {
    const r = due[i];
    try {
      // The token is minted HERE, at the moment we commit to telling them it
      // exists — not backfilled across the whole table in advance.
      const token = ensureClientPortalToken(r.email);
      if (!token) continue;
      const res = await emailClientPortalAnnouncement({ email: r.email, name: r.name, token });
      // ⚠️ sendEmail catches provider errors and RETURNS { ok: false } rather
      // than throwing, so a bare try/catch would mark a failed send as done and
      // that person would never hear from us. Check the result explicitly.
      if (res?.ok === false) {
        failed.push(r.email);
        continue;
      }
      markAnnounced(r.email);
      sent++;
    } catch (err) {
      console.error(`[announce] failed for ${r.email}:`, err.message);
      failed.push(r.email);
    }
    if (i < due.length - 1) await new Promise((done) => setTimeout(done, GAP_MS));
  }

  // ONE audit row per run, not per recipient — 40 identical entries would bury
  // every real booking event in the activity feed. The per-person record is
  // client_portals.announced_at.
  if (sent || failed.length) {
    logActivity({
      bookingId: null,
      eventType: "portal_announced",
      description:
        `Dashboard announcement sent to ${sent} past client${sent === 1 ? "" : "s"}` +
        (failed.length ? ` · ${failed.length} failed` : ""),
      ...actor,
    });
  }

  return { sent, failed, remaining: countAnnouncementRecipients() };
}

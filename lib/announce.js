/**
 * One-off announcement emails the owner sends from admin.
 *
 * Two audiences so far — past booking clients (their new bookings dashboard)
 * and directory tenants (they can now post their own events) — and both run
 * through the same loop below, deliberately. These are the only bulk sends in
 * the app, and the care they need is easy to lose in a copy-paste:
 *
 *  - nobody is mailed twice (stamped per send, not per batch)
 *  - a send that FAILS is not stamped, so the next run picks it up again
 *  - batched, because a server action that runs for minutes gets killed by the
 *    platform's request timeout halfway through
 *  - the owner sees a count and a sample before anything leaves
 */

import { emailClientPortalAnnouncement, emailTenantEventsAnnouncement } from "./email.js";
import {
  listAnnouncementRecipients,
  countAnnouncementRecipients,
  ensureClientPortalToken,
  markAnnounced,
} from "./portal.js";
import {
  listTenantAnnouncementRecipients,
  markTenantAnnounced,
  ensureDirectoryToken,
} from "./catalog.js";
import { logActivity } from "./activity.js";

// Resend's default ceiling is ~2 requests/second. 500ms leaves margin without
// making a realistic list (dozens, not thousands) take all afternoon.
const GAP_MS = 500;

/** Most one press will send. At GAP_MS apart that's ~20s — safely inside a request. */
export const ANNOUNCE_BATCH = 40;

/**
 * Send one batch. `send` returns sendEmail's result; `mark` stamps that
 * recipient as told. Neither is called for a recipient `send` rejects.
 */
async function sendBatch({ recipients, send, mark, describe }) {
  const failed = [];
  let sent = 0;

  for (let i = 0; i < recipients.length; i++) {
    const r = recipients[i];
    try {
      const res = await send(r);
      // ⚠️ sendEmail CATCHES provider errors and returns { ok: false } rather
      // than throwing, so a bare try/catch would stamp a failed send as done
      // and that recipient would never hear from us. Check it explicitly.
      if (res?.ok === false) {
        failed.push(describe(r));
        continue;
      }
      mark(r);
      sent++;
    } catch (err) {
      console.error(`[announce] failed for ${describe(r)}:`, err.message);
      failed.push(describe(r));
    }
    if (i < recipients.length - 1) await new Promise((done) => setTimeout(done, GAP_MS));
  }

  return { sent, failed };
}

/**
 * ONE audit row per run, not per recipient — 40 identical entries would bury
 * every real booking event in the activity feed. The per-recipient record is
 * the stamped column on their own row.
 */
function logRun({ eventType, what, sent, failed, actor }) {
  if (!sent && !failed.length) return;
  logActivity({
    bookingId: null,
    eventType,
    description:
      `${what} sent to ${sent} recipient${sent === 1 ? "" : "s"}` +
      (failed.length ? ` · ${failed.length} failed` : ""),
    ...actor,
  });
}

/* ------------------------------------------------ clients: your dashboard */

/** Who would be mailed, without minting a token or sending anything. */
export function previewAnnouncement({ sample = 8 } = {}) {
  const all = listAnnouncementRecipients();
  return { total: all.length, sample: all.slice(0, sample) };
}

export async function runPortalAnnouncement({ batch = ANNOUNCE_BATCH, actor = {} } = {}) {
  const due = listAnnouncementRecipients({ limit: batch });
  const { sent, failed } = await sendBatch({
    recipients: due,
    describe: (r) => r.email,
    // The token is minted HERE, at the moment we commit to telling them it
    // exists — not backfilled across the whole table in advance.
    send: (r) => {
      const token = ensureClientPortalToken(r.email);
      if (!token) throw new Error("could not mint a portal token");
      return emailClientPortalAnnouncement({ email: r.email, name: r.name, token });
    },
    mark: (r) => markAnnounced(r.email),
  });
  logRun({ eventType: "portal_announced", what: "Dashboard announcement", sent, failed, actor });
  return { sent, failed, remaining: countAnnouncementRecipients() };
}

/* -------------------------------------------- tenants: post your own events */

export function previewTenantAnnouncement({ sample = 8 } = {}) {
  const all = listTenantAnnouncementRecipients();
  return {
    total: all.length,
    sample: all.slice(0, sample).map((t) => ({
      email: t.contact_email,
      name: t.business_name,
    })),
  };
}

export async function runTenantEventsAnnouncement({ batch = ANNOUNCE_BATCH, actor = {} } = {}) {
  const due = listTenantAnnouncementRecipients({ limit: batch });
  const { sent, failed } = await sendBatch({
    recipients: due,
    describe: (t) => t.contact_email,
    send: (t) => {
      // Older directory rows may never have been given a self-edit link.
      const token = ensureDirectoryToken(t.id);
      if (!token) throw new Error("could not mint a listing token");
      return emailTenantEventsAnnouncement(t, token);
    },
    mark: (t) => markTenantAnnounced(t.id),
  });
  logRun({
    eventType: "tenant_events_announced",
    what: "Tenant events announcement",
    sent,
    failed,
    actor,
  });
  return { sent, failed, remaining: listTenantAnnouncementRecipients().length };
}

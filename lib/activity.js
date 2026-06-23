import { db } from "./db.js";

/**
 * Activity log writer + readers (accountability layer, server-only).
 *
 * Append-only: entries are never edited or deleted, except delivery_status,
 * which an email webhook may update. Every user-initiated action records the
 * real logged-in user (actorUserId + a denormalized actorName snapshot);
 * system-triggered events use actorName "system" with a null actorUserId.
 */

/**
 * Write one activity entry.
 *   bookingId       nullable (non-booking events like settings changes)
 *   eventType       machine key (see lib/activity-meta.js EVENT_CATEGORY)
 *   description      human-readable one-liner, e.g. "Invoice sent · $750.00"
 *   actorUserId      real user id, or null for system
 *   actorName        denormalized display name, or "system"
 *   recipientEmail   for email events
 *   amount           for payment / refund events
 *   deliveryStatus   sent|delivered|bounced|failed|unknown (email events)
 *   metadata         any JSON-serializable extra (e.g. denial reason details)
 */
export function logActivity({
  bookingId = null,
  eventType,
  description,
  actorUserId = null,
  actorName = "system",
  recipientEmail = null,
  amount = null,
  deliveryStatus = null,
  metadata = null,
} = {}) {
  if (!eventType || !description) {
    console.warn("[activity] skipped log with missing eventType/description");
    return null;
  }
  try {
    const info = db
      .prepare(
        `INSERT INTO activity_log
           (booking_id, event_type, description, actor_user_id, actor_name,
            recipient_email, amount, delivery_status, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        bookingId ?? null,
        eventType,
        description,
        actorUserId ?? null,
        actorName || "system",
        recipientEmail ?? null,
        amount ?? null,
        deliveryStatus ?? null,
        metadata ? JSON.stringify(metadata) : null
      );
    return info.lastInsertRowid;
  } catch (err) {
    // Logging must never break the booking flow it's recording.
    console.error("[activity] log failed:", err.message);
    return null;
  }
}

/**
 * Log an email-send event, deriving delivery_status + provider id from the
 * sendEmail() result. We only ever record "sent" (accepted by the provider) —
 * a later delivery webhook upgrades it to delivered/bounced/failed. Never faked.
 */
export function logEmail({
  bookingId = null,
  eventType,
  description,
  recipientEmail,
  amount = null,
  actorUserId = null,
  actorName = "system",
  sendResult,
  metadata = null,
}) {
  const ok = sendResult?.ok;
  const deliveryStatus = ok ? "sent" : "failed";
  const meta = { ...(metadata || {}) };
  if (sendResult?.id) meta.provider_id = sendResult.id;
  if (sendResult?.mode) meta.provider = sendResult.mode;
  return logActivity({
    bookingId,
    eventType,
    description,
    actorUserId,
    actorName,
    recipientEmail,
    amount,
    deliveryStatus,
    metadata: Object.keys(meta).length ? meta : null,
  });
}

/** All activity for one booking, oldest first (timeline order). */
export function listActivity(bookingId) {
  const rows = db
    .prepare(
      `SELECT * FROM activity_log WHERE booking_id = ? ORDER BY created_at ASC, id ASC`
    )
    .all(bookingId);
  return rows.map(parseRow);
}

/**
 * Recent activity across ALL bookings (newest first) for the global feed.
 *   type   optional event_type filter
 *   q      optional search over client name/email (joins bookings)
 *   limit  default 200
 */
export function listAllActivity({ type, q, limit = 200 } = {}) {
  const where = [];
  const params = [];
  if (type && type !== "all") {
    where.push("a.event_type = ?");
    params.push(type);
  }
  if (q && q.trim()) {
    where.push("(b.client_name LIKE ? OR b.client_email LIKE ? OR a.recipient_email LIKE ?)");
    const like = `%${q.trim()}%`;
    params.push(like, like, like);
  }
  const sql = `
    SELECT a.*, b.client_name AS booking_client_name, b.client_email AS booking_client_email,
           b.space AS booking_space, b.date AS booking_date
    FROM activity_log a
    LEFT JOIN bookings b ON b.id = a.booking_id
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT ?`;
  return db
    .prepare(sql)
    .all(...params, Number(limit) || 200)
    .map(parseRow);
}

/** Distinct event types present in the log (for the feed filter). */
export function listEventTypes() {
  return db
    .prepare("SELECT DISTINCT event_type FROM activity_log ORDER BY event_type")
    .all()
    .map((r) => r.event_type);
}

/** Email delivery webhook → upgrade an entry's delivery_status by provider id. */
export function updateDeliveryStatusByProviderId(providerId, status) {
  if (!providerId || !status) return 0;
  const rows = db
    .prepare("SELECT id, metadata FROM activity_log WHERE metadata LIKE ?")
    .all(`%"provider_id":"${providerId}"%`);
  let updated = 0;
  for (const r of rows) {
    db.prepare("UPDATE activity_log SET delivery_status = ? WHERE id = ?").run(status, r.id);
    updated++;
  }
  return updated;
}

function parseRow(r) {
  let metadata = null;
  if (r.metadata) {
    try {
      metadata = JSON.parse(r.metadata);
    } catch {
      metadata = null;
    }
  }
  return { ...r, metadata };
}

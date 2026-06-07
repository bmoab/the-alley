import { nanoid } from "nanoid";
import { db } from "./db.js";

/** Directory (tenant businesses) ------------------------------------------ */

export function listDirectory() {
  return db
    .prepare("SELECT * FROM directory ORDER BY sort_order ASC, business_name ASC")
    .all();
}

export function getDirectoryEntry(id) {
  return db.prepare("SELECT * FROM directory WHERE id = ?").get(id);
}

export function createDirectoryEntry(d) {
  return db
    .prepare(
      `INSERT INTO directory (business_name, category, description, photo_path, contact_link, contact_email, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      d.business_name,
      d.category ?? null,
      d.description ?? null,
      d.photo_path ?? null,
      d.contact_link ?? null,
      d.contact_email ?? null,
      Number(d.sort_order) || 0
    ).lastInsertRowid;
}

export function updateDirectoryEntry(id, d) {
  db.prepare(
    `UPDATE directory
       SET business_name = ?, category = ?, description = ?, photo_path = ?, contact_link = ?, contact_email = ?, sort_order = ?
     WHERE id = ?`
  ).run(
    d.business_name,
    d.category ?? null,
    d.description ?? null,
    d.photo_path ?? null,
    d.contact_link ?? null,
    d.contact_email ?? null,
    Number(d.sort_order) || 0,
    id
  );
}

export function deleteDirectoryEntry(id) {
  db.prepare("DELETE FROM directory WHERE id = ?").run(id);
}

/** Look up a business by its tenant self-edit token. */
export function getDirectoryByToken(token) {
  if (!token) return null;
  return db.prepare("SELECT * FROM directory WHERE edit_token = ?").get(token);
}

/**
 * Ensure a business has a self-edit token, generating one if missing.
 * Returns the token so the owner can share the edit link.
 */
export function ensureDirectoryToken(id) {
  const entry = getDirectoryEntry(id);
  if (!entry) return null;
  if (entry.edit_token) return entry.edit_token;
  const token = nanoid(24);
  db.prepare("UPDATE directory SET edit_token = ? WHERE id = ?").run(token, id);
  return token;
}

/**
 * Save a tenant's own edits to their directory page (via their token).
 * Tenants control their content (name, category, description, photo, contact)
 * but not sort_order — that stays with the owner.
 */
export function saveDirectoryListing(token, data) {
  const entry = getDirectoryByToken(token);
  if (!entry) return null;
  db.prepare(
    `UPDATE directory SET
        business_name = ?, category = ?, description = ?,
        contact_link = ?,
        photo_path = COALESCE(?, photo_path)
     WHERE edit_token = ?`
  ).run(
    data.business_name ?? entry.business_name,
    data.category ?? entry.category,
    data.description ?? entry.description,
    data.contact_link ?? entry.contact_link,
    data.photo_path ?? null,
    token
  );
  return getDirectoryByToken(token);
}

/** Gallery ----------------------------------------------------------------- */

export function listGallery() {
  return db
    .prepare("SELECT * FROM gallery ORDER BY sort_order ASC, id ASC")
    .all();
}

export function createGalleryImage(image_path, caption = null, sort_order = 0) {
  return db
    .prepare("INSERT INTO gallery (image_path, caption, sort_order) VALUES (?, ?, ?)")
    .run(image_path, caption, Number(sort_order) || 0).lastInsertRowid;
}

export function deleteGalleryImage(id) {
  db.prepare("DELETE FROM gallery WHERE id = ?").run(id);
}

/** Public events (listings) ------------------------------------------------ */

export function listEventsByStatus(status) {
  return db
    .prepare("SELECT * FROM events WHERE status = ? ORDER BY date ASC, time ASC")
    .all(status);
}

export function listAllEvents() {
  return db
    .prepare("SELECT * FROM events ORDER BY date ASC, time ASC")
    .all();
}

/**
 * Save a host's listing edits (via their token). `autoPublish` decides whether
 * a submit goes straight to 'live' or to 'pending' for owner review.
 */
export function saveHostListing(token, data, { submit = false, autoPublish = false } = {}) {
  const event = getEventByToken(token);
  if (!event) return null;
  const status = submit ? (autoPublish ? "live" : "pending") : event.status;
  db.prepare(
    `UPDATE events SET
        title = ?, description = ?, date = ?, time = ?,
        tickets = ?, price = ?, payment_instructions = ?, payment_link = ?,
        photo_path = COALESCE(?, photo_path),
        pdf_paths = ?, status = ?
     WHERE host_token = ?`
  ).run(
    data.title ?? event.title,
    data.description ?? event.description,
    data.date ?? event.date,
    data.time ?? event.time,
    data.tickets != null ? Number(data.tickets) : event.tickets,
    data.price ?? event.price,
    data.payment_instructions ?? event.payment_instructions,
    data.payment_link ?? event.payment_link,
    data.photo_path ?? null,
    data.pdf_paths != null ? JSON.stringify(data.pdf_paths) : event.pdf_paths,
    status,
    token
  );
  return getEventByToken(token);
}

/** Admin: update any event by id. */
export function updateEvent(id, data) {
  const event = getEvent(id);
  if (!event) return null;
  db.prepare(
    `UPDATE events SET
        title = ?, host_name = ?, description = ?, date = ?, time = ?, space = ?,
        tickets = ?, price = ?, payment_instructions = ?, payment_link = ?,
        photo_path = COALESCE(?, photo_path), pdf_paths = ?, status = ?
     WHERE id = ?`
  ).run(
    data.title ?? event.title,
    data.host_name ?? event.host_name,
    data.description ?? event.description,
    data.date ?? event.date,
    data.time ?? event.time,
    data.space ?? event.space,
    data.tickets != null ? Number(data.tickets) : event.tickets,
    data.price ?? event.price,
    data.payment_instructions ?? event.payment_instructions,
    data.payment_link ?? event.payment_link,
    data.photo_path ?? null,
    data.pdf_paths != null ? JSON.stringify(data.pdf_paths) : event.pdf_paths,
    data.status ?? event.status,
    id
  );
  return getEvent(id);
}

export function setEventStatus(id, status) {
  db.prepare("UPDATE events SET status = ? WHERE id = ?").run(status, id);
  return getEvent(id);
}

export function deleteEvent(id) {
  db.prepare("DELETE FROM events WHERE id = ?").run(id);
}

/** Admin: create one of The Alley's own events (not tied to a booking). */
export function createOwnEvent(data) {
  const info = db
    .prepare(
      `INSERT INTO events (booking_id, host_name, title, description, date, time, space,
        tickets, price, payment_instructions, payment_link, photo_path, pdf_paths, status)
       VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      data.host_name || "The Alley On Center",
      data.title,
      data.description ?? null,
      data.date,
      data.time ?? null,
      data.space ?? null,
      data.tickets != null ? Number(data.tickets) : null,
      data.price ?? null,
      data.payment_instructions ?? null,
      data.payment_link ?? null,
      data.photo_path ?? null,
      data.pdf_paths ? JSON.stringify(data.pdf_paths) : null,
      data.status ?? "live"
    );
  return getEvent(info.lastInsertRowid);
}

export function listLiveEvents() {
  return db
    .prepare("SELECT * FROM events WHERE status = 'live' ORDER BY date ASC, time ASC")
    .all();
}

export function listUpcomingLiveEvents(limit = 3) {
  const today = new Date().toISOString().slice(0, 10);
  return db
    .prepare(
      "SELECT * FROM events WHERE status = 'live' AND date >= ? ORDER BY date ASC, time ASC LIMIT ?"
    )
    .all(today, limit);
}

export function getEvent(id) {
  return db.prepare("SELECT * FROM events WHERE id = ?").get(id);
}

export function getEventByToken(token) {
  return db.prepare("SELECT * FROM events WHERE host_token = ?").get(token);
}

export function getDraftEventForBooking(bookingId) {
  return db
    .prepare("SELECT * FROM events WHERE booking_id = ?")
    .get(bookingId);
}

/**
 * Create a draft public-event listing tied to a paid, public booking, pre-filled
 * from the booking and authenticated by a unique host token. The host completes
 * it via /host-listing/{token} (build priority 8).
 */
export function createHostListingDraft(booking, token) {
  const existing = getDraftEventForBooking(booking.id);
  if (existing) return existing;
  const info = db
    .prepare(
      `INSERT INTO events (booking_id, host_name, title, date, time, space, status, host_token)
       VALUES (?, ?, ?, ?, ?, ?, 'draft', ?)`
    )
    .run(
      booking.id,
      booking.client_name,
      booking.event_type || "",
      booking.date,
      booking.start_time,
      booking.space,
      token
    );
  return db.prepare("SELECT * FROM events WHERE id = ?").get(info.lastInsertRowid);
}

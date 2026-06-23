import { nanoid } from "nanoid";
import { db, getContentValue } from "./db.js";
import { SPACE_BY_ID } from "./constants.js";
import { zoneSpace } from "./building-map.js";

/** Today as YYYY-MM-DD (local). */
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Is a row "live" right now: active flag on, started (or no start), not ended.
 * Dates are inclusive YYYY-MM-DD; null bounds mean open-ended.
 */
export function isLiveNow(row, now = today()) {
  if (!row || Number(row.active) === 0) return false;
  if (row.active_from && row.active_from > now) return false;
  if (row.active_until && row.active_until < now) return false;
  return true;
}

/** Directory (tenant businesses) ------------------------------------------ */

export function listDirectory() {
  return db
    .prepare("SELECT * FROM directory ORDER BY sort_order ASC, business_name ASC")
    .all();
}

/** Public directory: only tenants active within their date window. */
export function listPublicDirectory() {
  return listDirectory().filter((t) => isLiveNow(t));
}

/** Suites ------------------------------------------------------------------ */

export function listSuites() {
  return db.prepare("SELECT * FROM suites ORDER BY sort_order ASC, zone ASC").all();
}

export function getSuite(id) {
  return db.prepare("SELECT * FROM suites WHERE id = ?").get(id);
}

/** Suites occupied by a tenant (a tenant can hold more than one). */
export function suitesForTenant(tenantId) {
  return db
    .prepare("SELECT * FROM suites WHERE tenant_id = ? ORDER BY sort_order ASC, zone ASC")
    .all(tenantId);
}

/** Name a suite + set its vacant-space info (does NOT change tenant assignment). */
export function updateSuiteInfo(id, d) {
  const s = getSuite(id);
  if (!s) return null;
  db.prepare(
    `UPDATE suites SET name = ?, available = ?, vacant_photo = COALESCE(?, vacant_photo), vacant_blurb = ? WHERE id = ?`
  ).run(
    d.name ?? s.name,
    d.available ? 1 : 0,
    d.vacant_photo ?? null,
    d.vacant_blurb ?? s.vacant_blurb,
    id
  );
  return getSuite(id);
}

/**
 * Set exactly which suites a tenant occupies (supports one tenant across many
 * suites). Clears the tenant from any suite it no longer holds, then assigns the
 * chosen ones.
 */
export function setTenantSuites(tenantId, suiteIds = []) {
  const ids = suiteIds.map((n) => Number(n)).filter(Boolean);
  const tx = db.transaction(() => {
    db.prepare("UPDATE suites SET tenant_id = NULL WHERE tenant_id = ?").run(tenantId);
    const assign = db.prepare("UPDATE suites SET tenant_id = ? WHERE id = ?");
    for (const id of ids) assign.run(tenantId, id);
  });
  tx();
}

/** Owner: name a suite, assign/clear its tenant, set vacant-space info. */
export function updateSuite(id, d) {
  const s = getSuite(id);
  if (!s) return null;
  db.prepare(
    `UPDATE suites SET
        name = ?, tenant_id = ?, available = ?,
        vacant_photo = COALESCE(?, vacant_photo), vacant_blurb = ?, sort_order = ?
     WHERE id = ?`
  ).run(
    d.name ?? s.name,
    d.tenant_id ? Number(d.tenant_id) : null,
    d.available ? 1 : 0,
    d.vacant_photo ?? null,
    d.vacant_blurb ?? s.vacant_blurb,
    d.sort_order != null ? Number(d.sort_order) || 0 : s.sort_order,
    id
  );
  return getSuite(id);
}

/**
 * Per-zone data for the interactive floor map. Returns a map keyed by `zone`:
 *   { name, floor, tenant (active directory row | null), available,
 *     vacant_photo, vacant_blurb }
 * The tenant's own content (description, photo, links) drives the card.
 */
export function getDirectoryMapData() {
  const suites = listSuites();
  const byZone = {};
  for (const s of suites) {
    // The two rentable spaces (gallery = Main Floor, 200 = The Alley Loft) show
    // their booking info pulled from Spaces, not a tenant or lease pitch.
    const spaceId = zoneSpace(s.zone);
    if (spaceId && SPACE_BY_ID[spaceId]) {
      const sp = SPACE_BY_ID[spaceId];
      const photo =
        listSpacePhotos(spaceId)[0]?.image_path ||
        getContentValue(`space_${spaceId}_image`, "") ||
        null;
      byZone[s.zone] = {
        zone: s.zone,
        name: s.name || s.zone,
        floor: s.floor,
        tenant: null,
        space: {
          id: spaceId,
          name: sp.name,
          blurb: sp.blurb,
          capacity: sp.capacity,
          photo,
          href: `/spaces#book-${spaceId}`,
        },
      };
      continue;
    }

    let tenant = null;
    if (s.tenant_id) {
      const t = getDirectoryEntry(s.tenant_id);
      if (t && isLiveNow(t)) tenant = t;
    }
    byZone[s.zone] = {
      zone: s.zone,
      name: s.name || s.zone,
      floor: s.floor,
      tenant,
      available: Number(s.available) === 1,
      vacant_photo: s.vacant_photo || null,
      vacant_blurb: s.vacant_blurb || null,
    };
  }
  return byZone;
}

/** Public directory tenants, each annotated with the suites they occupy. */
export function listPublicDirectoryWithSuites() {
  const tenants = listPublicDirectory();
  const suites = listSuites();
  return tenants.map((t) => ({
    ...t,
    suites: suites
      .filter((s) => s.tenant_id === t.id)
      .map((s) => ({ zone: s.zone, name: s.name || s.zone })),
  }));
}

export function getDirectoryEntry(id) {
  return db.prepare("SELECT * FROM directory WHERE id = ?").get(id);
}

export function createDirectoryEntry(d) {
  return db
    .prepare(
      `INSERT INTO directory (business_name, contact_email, suite, floor, active, active_from, active_until, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      d.business_name,
      d.contact_email ?? null,
      d.suite ?? null,
      d.floor ?? null,
      d.active ? 1 : 0,
      d.active_from || null,
      d.active_until || null,
      Number(d.sort_order) || 0
    ).lastInsertRowid;
}

/**
 * Owner update — only the minimal owner-controlled fields (name, email, active
 * window, building location, order). Tenant-managed content (category,
 * description, photo, links) is left untouched here; tenants edit it themselves.
 */
export function updateDirectoryEntry(id, d) {
  db.prepare(
    `UPDATE directory
       SET business_name = ?, contact_email = ?, suite = ?, floor = ?, active = ?, active_from = ?, active_until = ?, sort_order = ?
     WHERE id = ?`
  ).run(
    d.business_name,
    d.contact_email ?? null,
    d.suite ?? null,
    d.floor ?? null,
    d.active ? 1 : 0,
    d.active_from || null,
    d.active_until || null,
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

/** Parse a gallery row's `tags` JSON into a string[] (always returns an array). */
export function parseTags(value) {
  if (!value) return [];
  try {
    const arr = JSON.parse(value);
    return Array.isArray(arr) ? arr.filter(Boolean).map(String) : [];
  } catch {
    return [];
  }
}

export function listGallery() {
  return db
    .prepare("SELECT * FROM gallery ORDER BY sort_order ASC, id ASC")
    .all()
    .map((row) => ({ ...row, tagList: parseTags(row.tags) }));
}

export function createGalleryImage(image_path, caption = null, tags = [], sort_order = 0) {
  const tagsJson = Array.isArray(tags) ? JSON.stringify(tags) : tags || null;
  return db
    .prepare("INSERT INTO gallery (image_path, caption, tags, sort_order) VALUES (?, ?, ?, ?)")
    .run(image_path, caption, tagsJson, Number(sort_order) || 0).lastInsertRowid;
}

export function updateGalleryImage(id, { caption, tags, sort_order } = {}) {
  const row = db.prepare("SELECT * FROM gallery WHERE id = ?").get(id);
  if (!row) return null;
  const tagsJson = tags == null ? row.tags : Array.isArray(tags) ? JSON.stringify(tags) : tags;
  db.prepare("UPDATE gallery SET caption = ?, tags = ?, sort_order = ? WHERE id = ?").run(
    caption ?? row.caption,
    tagsJson,
    sort_order != null ? Number(sort_order) || 0 : row.sort_order,
    id
  );
}

export function deleteGalleryImage(id) {
  db.prepare("DELETE FROM gallery WHERE id = ?").run(id);
}

/** Distinct gallery tags with counts, in first-seen order (for filter chips). */
export function listGalleryTags() {
  const rows = listGallery();
  const order = [];
  const counts = new Map();
  for (const row of rows) {
    for (const tag of row.tagList) {
      if (!counts.has(tag)) order.push(tag);
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  return order.map((tag) => ({ tag, count: counts.get(tag) }));
}

/** Space photos (rentable rooms) ------------------------------------------- */

export function listSpacePhotos(space) {
  return db
    .prepare("SELECT * FROM space_photos WHERE space = ? ORDER BY sort_order ASC, id ASC")
    .all(space);
}

export function addSpacePhoto(space, image_path, caption = null, sort_order = 0) {
  return db
    .prepare("INSERT INTO space_photos (space, image_path, caption, sort_order) VALUES (?, ?, ?, ?)")
    .run(space, image_path, caption, Number(sort_order) || 0).lastInsertRowid;
}

export function updateSpacePhoto(id, { caption, sort_order } = {}) {
  const row = db.prepare("SELECT * FROM space_photos WHERE id = ?").get(id);
  if (!row) return null;
  db.prepare("UPDATE space_photos SET caption = ?, sort_order = ? WHERE id = ?").run(
    caption ?? row.caption,
    sort_order != null ? Number(sort_order) || 0 : row.sort_order,
    id
  );
}

export function deleteSpacePhoto(id) {
  db.prepare("DELETE FROM space_photos WHERE id = ?").run(id);
}

/** Exhibitors -------------------------------------------------------------- */

export function listExhibitors(status = null) {
  const rows = status
    ? db
        .prepare("SELECT * FROM exhibitors WHERE status = ? ORDER BY sort_order ASC, id ASC")
        .all(status)
    : db.prepare("SELECT * FROM exhibitors ORDER BY sort_order ASC, id ASC").all();
  return rows.map((e) => ({ ...e, works: listExhibitorPhotos(e.id) }));
}

export function getExhibitor(id) {
  const e = db.prepare("SELECT * FROM exhibitors WHERE id = ?").get(id);
  if (!e) return null;
  return { ...e, works: listExhibitorPhotos(e.id) };
}

export function getExhibitorByToken(token) {
  if (!token) return null;
  const e = db.prepare("SELECT * FROM exhibitors WHERE edit_token = ?").get(token);
  if (!e) return null;
  return { ...e, works: listExhibitorPhotos(e.id) };
}

export function createExhibitor(d) {
  return db
    .prepare(
      `INSERT INTO exhibitors (name, contact_email, active, active_from, active_until, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      d.name,
      d.contact_email ?? null,
      d.active ? 1 : 0,
      d.active_from || null,
      d.active_until || null,
      Number(d.sort_order) || 0
    ).lastInsertRowid;
}

/**
 * Owner update — only the minimal owner-controlled fields (name, email, active
 * window, order). Artist-managed content (discipline, blurb, handle, photos) is
 * left untouched; exhibitors edit that themselves via their link.
 */
export function updateExhibitor(id, d) {
  const e = db.prepare("SELECT * FROM exhibitors WHERE id = ?").get(id);
  if (!e) return null;
  db.prepare(
    `UPDATE exhibitors SET
        name = ?, contact_email = ?, active = ?, active_from = ?, active_until = ?, sort_order = ?
     WHERE id = ?`
  ).run(
    d.name ?? e.name,
    d.contact_email ?? e.contact_email,
    d.active ? 1 : 0,
    d.active_from || null,
    d.active_until || null,
    d.sort_order != null ? Number(d.sort_order) || 0 : e.sort_order,
    id
  );
  return getExhibitor(id);
}

/** "current" while live now, "past" once the end date passes, else "hidden". */
export function exhibitorPhase(ex, now = today()) {
  if (!ex || Number(ex.active) === 0) return "hidden";
  if (ex.active_until && ex.active_until < now) return "past";
  return "current";
}

/** Public exhibitors split into current (on view) + past (archive). */
export function listExhibitorsByPhase() {
  const all = listExhibitors();
  const current = [];
  const past = [];
  for (const ex of all) {
    const phase = exhibitorPhase(ex);
    if (phase === "current") current.push(ex);
    else if (phase === "past") past.push(ex);
  }
  return { current, past };
}

export function deleteExhibitor(id) {
  db.prepare("DELETE FROM exhibitor_photos WHERE exhibitor_id = ?").run(id);
  db.prepare("DELETE FROM exhibitors WHERE id = ?").run(id);
}

export function ensureExhibitorToken(id) {
  const e = db.prepare("SELECT * FROM exhibitors WHERE id = ?").get(id);
  if (!e) return null;
  if (e.edit_token) return e.edit_token;
  const token = nanoid(24);
  db.prepare("UPDATE exhibitors SET edit_token = ? WHERE id = ?").run(token, id);
  return token;
}

/** Exhibitor self-edit (via token): content fields the artist controls. */
export function saveExhibitorListing(token, data) {
  const e = getExhibitorByToken(token);
  if (!e) return null;
  db.prepare(
    `UPDATE exhibitors SET
        name = ?, discipline = ?, blurb = ?, site_handle = ?,
        profile_photo = COALESCE(?, profile_photo)
     WHERE edit_token = ?`
  ).run(
    data.name ?? e.name,
    data.discipline ?? e.discipline,
    data.blurb ?? e.blurb,
    data.site_handle ?? e.site_handle,
    data.profile_photo ?? null,
    token
  );
  return getExhibitorByToken(token);
}

export function listExhibitorPhotos(exhibitorId) {
  return db
    .prepare("SELECT * FROM exhibitor_photos WHERE exhibitor_id = ? ORDER BY sort_order ASC, id ASC")
    .all(exhibitorId);
}

export function addExhibitorPhoto(exhibitorId, image_path, caption = null, sort_order = 0) {
  return db
    .prepare(
      "INSERT INTO exhibitor_photos (exhibitor_id, image_path, caption, sort_order) VALUES (?, ?, ?, ?)"
    )
    .run(exhibitorId, image_path, caption, Number(sort_order) || 0).lastInsertRowid;
}

export function deleteExhibitorPhoto(id) {
  db.prepare("DELETE FROM exhibitor_photos WHERE id = ?").run(id);
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
    // Date & time are locked to the underlying booking — the host can't change
    // them from their listing link (ignore any client-sent values).
    event.date,
    event.time,
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
        kind = ?, end_label = ?,
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
    data.kind ?? event.kind,
    data.end_label ?? event.end_label,
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
        kind, end_label, tickets, price, payment_instructions, payment_link, photo_path, pdf_paths, status)
       VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      data.host_name || "The Alley On Center",
      data.title,
      data.description ?? null,
      data.date,
      data.time ?? null,
      data.space ?? null,
      data.kind ?? null,
      data.end_label ?? null,
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
/**
 * Owner invites a host directly (no booking required): creates a draft event
 * with a self-edit token and the host's email. The host fills in all the
 * details (title, description, photo, payment) via /host-listing/{token}.
 */
export function createHostInvite({ host_name, host_email, date, active_until }) {
  const token = nanoid(24);
  const info = db
    .prepare(
      `INSERT INTO events (host_name, host_email, title, date, active_until, status, host_token)
       VALUES (?, ?, '', ?, ?, 'draft', ?)`
    )
    .run(host_name || "", host_email || null, date || null, active_until || null, token);
  return { id: info.lastInsertRowid, token };
}

export function createHostListingDraft(booking, token) {
  const existing = getDraftEventForBooking(booking.id);
  if (existing) return existing;
  // Goes LIVE immediately with just a title so it shows on the public calendar
  // the moment the booking is paid. The host then enriches it (description,
  // photo, payment info) via their private link — and it stays live.
  const title = (booking.event_type || "").trim() || `${(booking.client_name || "A host").split(" ")[0]}'s event`;
  const info = db
    .prepare(
      `INSERT INTO events (booking_id, host_name, host_email, title, date, time, space, status, host_token)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'live', ?)`
    )
    .run(
      booking.id,
      booking.client_name,
      booking.client_email || null,
      title,
      booking.date,
      booking.start_time,
      booking.space,
      token
    );
  return db.prepare("SELECT * FROM events WHERE id = ?").get(info.lastInsertRowid);
}

import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { SUITE_CODES } from "./building-map.js";

/**
 * SQLite data layer for the prototype.
 *
 * Design notes for future PostgreSQL migration:
 *  - All access goes through this module; route/UI code never touches SQL directly
 *    except via the exported `db` handle and helper queries below.
 *  - Schema uses plain column types and avoids SQLite-only features so the DDL can
 *    be translated to Postgres with minimal changes (INTEGER PK -> SERIAL/IDENTITY,
 *    booleans stored as 0/1, timestamps as TEXT ISO-8601).
 *  - A single connection is cached on globalThis to survive Next.js hot reloads.
 */

const DB_PATH =
  process.env.DATABASE_PATH || path.join(process.cwd(), "data", "alley.db");

function createConnection() {
  // Ensure the database file's parent directory exists. This must use the
  // actual DB_PATH's directory (e.g. /data when DATABASE_PATH=/data/alley.db on
  // Railway), not a hardcoded ./data — otherwise opening the DB fails.
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const connection = new Database(DB_PATH);
  connection.pragma("journal_mode = WAL");
  connection.pragma("foreign_keys = ON");
  // Wait (up to 5s) for a transient lock instead of failing immediately —
  // protects against brief contention when another instance holds the file.
  connection.pragma("busy_timeout = 5000");
  migrate(connection);
  return connection;
}

function migrate(connection) {
  connection.exec(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Append-only audit trail (accountability layer). One row per meaningful
    -- lifecycle event. actor_name is denormalized so it survives even after a
    -- user is deactivated ("Approved by Kayla" still reads correctly). Rows are
    -- never edited/deleted except delivery_status updates via an email webhook.
    CREATE TABLE IF NOT EXISTS activity_log (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id      INTEGER,                       -- nullable (non-booking events)
      event_type      TEXT NOT NULL,
      description     TEXT NOT NULL,                 -- human-readable one-liner
      actor_user_id   INTEGER,                       -- nullable (system events)
      actor_name      TEXT NOT NULL DEFAULT 'system',
      recipient_email TEXT,                          -- for email events
      amount          REAL,                          -- for payment/refund events
      delivery_status TEXT,                          -- sent|delivered|bounced|failed|unknown
      metadata        TEXT,                          -- JSON (e.g. denial reason)
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (booking_id) REFERENCES bookings(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS site_content (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      space              TEXT NOT NULL,
      date               TEXT NOT NULL,           -- YYYY-MM-DD
      start_time         TEXT NOT NULL,           -- HH:MM (24h)
      hours              REAL NOT NULL,
      status             TEXT NOT NULL DEFAULT 'pending', -- pending|held|confirmed|denied|completed|expired|cancelled
      client_name        TEXT NOT NULL,
      client_email       TEXT NOT NULL,
      client_phone       TEXT NOT NULL,
      event_type         TEXT,
      guests             TEXT,
      alcohol            INTEGER NOT NULL DEFAULT 0,
      notes              TEXT,
      is_recurring       INTEGER NOT NULL DEFAULT 0,
      recurring_schedule TEXT,
      is_public_event    INTEGER NOT NULL DEFAULT 0,
      rate               REAL NOT NULL DEFAULT 75,
      sessions           INTEGER NOT NULL DEFAULT 1,
      deposit            REAL NOT NULL DEFAULT 150,
      total              REAL NOT NULL DEFAULT 0,
      square_invoice_id  TEXT,
      payment_link       TEXT,
      payment_status     TEXT DEFAULT 'unpaid',   -- unpaid|paid|refunded
      hold_expires_at    TEXT,
      deposit_status     TEXT DEFAULT 'pending',  -- pending|refunded|withheld
      created_at         TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS events (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id           INTEGER,                 -- nullable for Alley's own events
      host_name            TEXT,
      title                TEXT,
      description          TEXT,
      date                 TEXT,
      time                 TEXT,
      space                TEXT,
      tickets              INTEGER,
      price                TEXT,
      payment_instructions TEXT,
      payment_link         TEXT,
      photo_path           TEXT,
      pdf_paths            TEXT,                    -- JSON array of paths
      status               TEXT NOT NULL DEFAULT 'draft', -- draft|pending|live|removed
      host_token           TEXT UNIQUE,
      created_at           TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (booking_id) REFERENCES bookings(id)
    );

    CREATE TABLE IF NOT EXISTS directory (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      business_name TEXT NOT NULL,
      category      TEXT,
      description   TEXT,
      photo_path    TEXT,
      contact_link  TEXT,
      contact_email TEXT,
      edit_token    TEXT UNIQUE,
      sort_order    INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS gallery (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      image_path TEXT NOT NULL,
      caption    TEXT,
      tags       TEXT,                     -- JSON array of tag strings (filter chips)
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    -- Gallery exhibitors (artists shown in the gallery). Current = featured
    -- blocks; past = flip cards. Each exhibitor can self-manage via edit_token.
    CREATE TABLE IF NOT EXISTS exhibitors (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL,
      discipline    TEXT,
      when_text     TEXT,                  -- e.g. "On view · Jul–Sep 2026" / "Spring 2025"
      blurb         TEXT,
      profile_photo TEXT,                  -- portrait image path
      site_handle   TEXT,                  -- @handle or url
      status        TEXT NOT NULL DEFAULT 'current', -- current|past
      sort_order    INTEGER NOT NULL DEFAULT 0,
      edit_token    TEXT UNIQUE,
      contact_email TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Building suites. One row per drawn zone on the floor plans (keyed by the
    -- zone code, which matches lib/building-map.js). The owner names each suite,
    -- assigns a tenant (a tenant can hold several suites), and for empty suites
    -- can set a photo + blurb + available pitch shown on the interactive map.
    CREATE TABLE IF NOT EXISTS suites (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      zone         TEXT NOT NULL UNIQUE,   -- stable geometry key (building-map code)
      name         TEXT,                   -- owner-editable display name/number
      floor        TEXT,
      tenant_id    INTEGER,                -- FK directory.id (nullable = vacant)
      available    INTEGER NOT NULL DEFAULT 0,
      vacant_photo TEXT,
      vacant_blurb TEXT,
      sort_order   INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (tenant_id) REFERENCES directory(id) ON DELETE SET NULL
    );

    -- Many-to-many suite ↔ tenant links. Supersedes suites.tenant_id (kept as a
    -- legacy column, backfilled once into this table below). A suite may hold
    -- several tenants (two businesses sharing one suite to split the rent) and a
    -- tenant may hold several suites — this table is the source of truth for both.
    CREATE TABLE IF NOT EXISTS suite_tenants (
      suite_id  INTEGER NOT NULL,
      tenant_id INTEGER NOT NULL,
      PRIMARY KEY (suite_id, tenant_id),
      FOREIGN KEY (suite_id)  REFERENCES suites(id)     ON DELETE CASCADE,
      FOREIGN KEY (tenant_id) REFERENCES directory(id)  ON DELETE CASCADE
    );

    -- Photos for the rentable spaces (the Loft / Main Floor). The first photo
    -- (lowest sort_order) is the lead image; the rest fill the thumbnail strip
    -- on the public Spaces page.
    CREATE TABLE IF NOT EXISTS space_photos (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      space      TEXT NOT NULL,            -- 'loft' | 'main'
      image_path TEXT NOT NULL,
      caption    TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    -- An exhibitor's individual works (art photos).
    CREATE TABLE IF NOT EXISTS exhibitor_photos (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      exhibitor_id INTEGER NOT NULL,
      image_path   TEXT NOT NULL,
      caption      TEXT,
      sort_order   INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (exhibitor_id) REFERENCES exhibitors(id) ON DELETE CASCADE
    );

    -- Owner closures: block new bookings for a space (or all) on a date range,
    -- either all day (null times) or within a time window.
    CREATE TABLE IF NOT EXISTS closures (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      space      TEXT NOT NULL DEFAULT 'all',  -- 'loft' | 'main' | 'all'
      start_date TEXT NOT NULL,                -- YYYY-MM-DD (inclusive)
      end_date   TEXT NOT NULL,                -- YYYY-MM-DD (inclusive)
      start_time TEXT,                         -- HH:MM or NULL (full day)
      end_time   TEXT,
      reason     TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS contact_messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      email      TEXT NOT NULL,
      message    TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Reminder log so deposit refund reminders fire once per day (section 4d).
    CREATE TABLE IF NOT EXISTS deposit_reminders (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id   INTEGER NOT NULL,
      day_number   INTEGER NOT NULL,
      sent_at      TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (booking_id) REFERENCES bookings(id)
    );

    CREATE INDEX IF NOT EXISTS idx_bookings_space_date ON bookings(space, date);
    CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
    CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
    CREATE INDEX IF NOT EXISTS idx_activity_booking ON activity_log(booking_id);
    CREATE INDEX IF NOT EXISTS idx_activity_type ON activity_log(event_type);
    CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at);
  `);

  // Additive column migrations for databases created before these columns existed.
  ensureColumn(connection, "directory", "contact_email", "contact_email TEXT");
  ensureColumn(connection, "directory", "edit_token", "edit_token TEXT");
  ensureColumn(connection, "directory", "suite", "suite TEXT");
  ensureColumn(connection, "directory", "floor", "floor TEXT");
  // Tenant-managed extras: links = JSON [{label, url}], photos = JSON [path].
  // contact_link / photo_path keep mirroring the first of each for older code.
  ensureColumn(connection, "directory", "links", "links TEXT");
  ensureColumn(connection, "directory", "photos", "photos TEXT");
  // Exhibitor links: JSON [{label, url}]; site_handle mirrors the first url.
  ensureColumn(connection, "exhibitors", "links", "links TEXT");
  ensureColumn(connection, "gallery", "tags", "tags TEXT");
  ensureColumn(connection, "bookings", "event_title", "event_title TEXT");
  ensureColumn(connection, "events", "kind", "kind TEXT");
  ensureColumn(connection, "events", "end_label", "end_label TEXT");
  // Owner-set lifecycle fields (the rest is self-managed by tenant/exhibitor/host).
  // ADD COLUMN ... DEFAULT 1 backfills existing rows as active, so nothing hides.
  ensureColumn(connection, "directory", "active", "active INTEGER NOT NULL DEFAULT 1");
  ensureColumn(connection, "directory", "active_from", "active_from TEXT");
  ensureColumn(connection, "directory", "active_until", "active_until TEXT");
  ensureColumn(connection, "exhibitors", "active", "active INTEGER NOT NULL DEFAULT 1");
  ensureColumn(connection, "exhibitors", "active_from", "active_from TEXT");
  ensureColumn(connection, "exhibitors", "active_until", "active_until TEXT");
  ensureColumn(connection, "events", "host_email", "host_email TEXT");
  ensureColumn(connection, "events", "active_until", "active_until TEXT");
  // Labeled links on an event (host site, tickets, socials…), JSON [{label,url}]
  // — same shape as directory/exhibitor links, rendered as buttons.
  ensureColumn(connection, "events", "links", "links TEXT");
  // Whether the host has posted their own details yet. A listing can go live as
  // a title-only placeholder (shows on the calendar immediately); this stays 0
  // until the host fills it in, so the owner knows who still needs a nudge.
  ensureColumn(connection, "events", "host_posted", "host_posted INTEGER NOT NULL DEFAULT 0");
  // Per-session content for a recurring series listing: which fields the host
  // customized per date, and the per-date values. JSON:
  //   { fields:["description",…], sessions:{ "YYYY-MM-DD":{ description:… } } }
  // Missing / not-customized fields fall back to the shared event row.
  ensureColumn(connection, "events", "session_content", "session_content TEXT");
  // Cancellation / restore lifecycle fields (soft-delete + refund record).
  ensureColumn(connection, "bookings", "cancelled_at", "cancelled_at TEXT");
  ensureColumn(connection, "bookings", "cancelled_by", "cancelled_by TEXT");
  ensureColumn(connection, "bookings", "refund_amount", "refund_amount REAL");
  ensureColumn(connection, "bookings", "refund_type", "refund_type TEXT"); // full|deposit_only|none
  ensureColumn(connection, "bookings", "restored_at", "restored_at TEXT");
  // Deposit resolution: how much of the cleaning deposit was refunded vs withheld,
  // and an optional reason (e.g. damage) shown to the client + kept on record.
  ensureColumn(connection, "bookings", "deposit_refunded", "deposit_refunded REAL");
  ensureColumn(connection, "bookings", "deposit_reason", "deposit_reason TEXT");

  // Recurring booking series. A recurring request fans out into N linked rows
  // sharing series_id (= the first date's row id). Each date is its own bookable
  // slot with its own rental invoice. ONE deposit per series lives on the
  // "holder" row (the first date) and is billed via its OWN invoice
  // (deposit_invoice_id), kept separate from any rental invoice so per-date
  // cancellation is always a clean full refund.
  ensureColumn(connection, "bookings", "series_id", "series_id INTEGER");
  ensureColumn(connection, "bookings", "series_index", "series_index INTEGER"); // 1..N order within the series
  ensureColumn(connection, "bookings", "series_total", "series_total INTEGER"); // N, for "class 2 of 4" display
  ensureColumn(connection, "bookings", "is_deposit_holder", "is_deposit_holder INTEGER NOT NULL DEFAULT 0");
  ensureColumn(connection, "bookings", "series_end_date", "series_end_date TEXT"); // last class date (gates deposit resolution)
  ensureColumn(connection, "bookings", "deposit_invoice_id", "deposit_invoice_id TEXT"); // holder only
  ensureColumn(connection, "bookings", "deposit_payment_link", "deposit_payment_link TEXT"); // holder only
  ensureColumn(connection, "bookings", "deposit_payment_status", "deposit_payment_status TEXT DEFAULT 'unpaid'"); // holder only
  // Index created here (not in the schema block) since series_id is an additive column.
  connection.exec("CREATE INDEX IF NOT EXISTS idx_bookings_series ON bookings(series_id)");

  // Archive: hides a booking from the admin list without destroying it. Exists
  // so pre-launch practice bookings (some carrying real, since-refunded Square
  // invoices) can be tidied away without losing the payment record.
  ensureColumn(connection, "bookings", "archived", "archived INTEGER NOT NULL DEFAULT 0");

  // Tenant attribution: which building tenant (directory row) a booking belongs
  // to, tagged by the owner at approval. Tenants get a couple of free bookings
  // per calendar year; the allowance is counted from the $0 bookings tagged
  // here, so the tag records WHO and the price records whether it was free.
  ensureColumn(connection, "bookings", "tenant_id", "tenant_id INTEGER REFERENCES directory(id)");
  connection.exec("CREATE INDEX IF NOT EXISTS idx_bookings_tenant ON bookings(tenant_id)");

  // Payment-reminder cron: the venue-local date (YYYY-MM-DD) a payment reminder
  // was last emailed for this booking, so at most one nudge goes out per day.
  // Set to the approval/restore day up front so the approval email covers day 0.
  ensureColumn(connection, "bookings", "payment_reminder_last_sent", "payment_reminder_last_sent TEXT");

  // Multi-user admin accounts (accountability layer). Additive on admin_users so
  // the existing single-owner row is preserved; new columns backfill sensibly
  // (active by default, role 'user' unless promoted by the owner seeder).
  ensureColumn(connection, "admin_users", "name", "name TEXT");
  ensureColumn(connection, "admin_users", "role", "role TEXT NOT NULL DEFAULT 'user'");
  ensureColumn(connection, "admin_users", "is_active", "is_active INTEGER NOT NULL DEFAULT 1");
  ensureColumn(connection, "admin_users", "created_by", "created_by INTEGER");
  ensureColumn(connection, "admin_users", "last_login_at", "last_login_at TEXT");
  ensureColumn(connection, "admin_users", "must_change_password", "must_change_password INTEGER NOT NULL DEFAULT 0");
  // Password-reset token (forgot-password flow). Hashed-token-free: a random
  // token + expiry stored directly; cleared on use.
  ensureColumn(connection, "admin_users", "reset_token", "reset_token TEXT");
  ensureColumn(connection, "admin_users", "reset_expires_at", "reset_expires_at TEXT");

  seedDefaults(connection);
  migrateSpaceImagesToGallery(connection);
  migrateSuiteTenantsToJunction(connection);
}

/**
 * One-time: copy each suite's legacy single `tenant_id` into the many-to-many
 * `suite_tenants` table, which becomes the source of truth for occupancy.
 * Guarded by a settings flag so it runs exactly once — after this, assignments
 * are managed only through the junction table (setTenantSuites), and the old
 * `suites.tenant_id` column is left untouched as a historical record.
 */
function migrateSuiteTenantsToJunction(connection) {
  const flag = connection
    .prepare("SELECT value FROM settings WHERE key = 'suite_tenants_migrated'")
    .get();
  if (flag && flag.value === "1") return;
  const link = connection.prepare(
    "INSERT OR IGNORE INTO suite_tenants (suite_id, tenant_id) VALUES (?, ?)"
  );
  const assigned = connection
    .prepare("SELECT id, tenant_id FROM suites WHERE tenant_id IS NOT NULL")
    .all();
  for (const s of assigned) link.run(s.id, s.tenant_id);
  connection
    .prepare(
      "INSERT INTO settings (key, value) VALUES ('suite_tenants_migrated', '1') ON CONFLICT(key) DO UPDATE SET value = '1'"
    )
    .run();
}

/**
 * One-time: carry the legacy per-space fallback image (`space_${id}_image` in
 * site_content) into the `space_photos` gallery as the lead photo, since the
 * homepage + spaces page now read the gallery as the single source. Guarded by a
 * settings flag so it runs exactly once.
 */
function migrateSpaceImagesToGallery(connection) {
  const flag = connection
    .prepare("SELECT value FROM settings WHERE key = 'space_image_migrated'")
    .get();
  if (flag && flag.value === "1") return;
  for (const id of ["loft", "main"]) {
    const row = connection
      .prepare("SELECT value FROM site_content WHERE key = ?")
      .get(`space_${id}_image`);
    const img = row?.value;
    if (!img) continue;
    const exists = connection
      .prepare("SELECT 1 FROM space_photos WHERE space = ? AND image_path = ?")
      .get(id, img);
    if (exists) continue;
    // sort_order -1 → becomes the lead photo (listSpacePhotos orders by sort ASC).
    connection
      .prepare("INSERT INTO space_photos (space, image_path, caption, sort_order) VALUES (?, ?, NULL, -1)")
      .run(id, img);
  }
  connection
    .prepare(
      "INSERT INTO settings (key, value) VALUES ('space_image_migrated', '1') ON CONFLICT(key) DO UPDATE SET value = '1'"
    )
    .run();
}

/** Add a column to a table if it doesn't already exist (idempotent migration). */
function ensureColumn(connection, table, column, ddl) {
  const cols = connection.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    try {
      connection.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    } catch (err) {
      // Tolerate a race where a parallel process (e.g. a `next build` worker)
      // added the same column between our check and the ALTER.
      if (!/duplicate column name/i.test(err.message)) throw err;
    }
  }
}

/** Default settings + site content. Idempotent — only inserts missing keys. */
function seedDefaults(connection) {
  const settingDefaults = {
    standard_rate: "75",
    minimum_hours: "2",
    maximum_hours: "8", // longest single booking
    min_lead_hours: "0", // minimum advance notice (0 = no requirement)
    deposit: "150",
    open_hour: "8", // 8 AM
    close_hour: "23", // 11 PM
    cleanup_buffer_minutes: "60",
    payment_window_days: "3",
    listing_auto_publish: "false", // owner-review by default (section 5b)
    // Cancellation policy (matches the rental agreement PDF). Editable in admin.
    cancellation_cutoff_hours: "72",
    refund_before_cutoff: "full", // full = rental + deposit
    refund_within_cutoff: "deposit_only", // rental forfeited, deposit refunded
    // Recurring series. The first session's rental invoice is sent at approval;
    // each remaining session's invoice goes out this many days before that
    // session (applies to dates 2..N only).
    series_invoice_lead_days: "5",
    series_max_occurrences: "26", // cap on sessions in one recurring request
    series_max_span_days: "400", // recurrence can stretch up to ~a year (e.g. monthly)
  };
  const contentDefaults = {
    home_hero_tagline: "The Alley is more than a building; it's an invitation.",
    home_hero_subtitle:
      "A space intentionally created in the heart of downtown Logan for artists, entrepreneurs, and dreamers to gather, create, and be seen.",
    home_intro:
      "The Alley is shaped by the people who show up and create here every day — a living creative ecosystem on Center Street where small businesses, artists, events, and community intersect.",
    home_cta_heading: "Bring your gathering to The Alley",
    home_cta_subtitle: "You bring the idea. We'll help with the space.",
    about_body:
      "The Alley is a living creative ecosystem located on Center Street, where small businesses, artists, events, and community intersect. It's an environment designed for collaboration, experimentation, and connection.\n\nFounded by Chelsea Funk and her daughter Caylee Funk — both lifelong Cache Valley residents — The Alley grew from a shared entrepreneurial vision into a commitment to building space for connection, creativity, and collaboration.\n\nArt is what we use to decorate space. Music is what we use to decorate time. Everything we do here lives somewhere between those two ideas.",
    contact_address: "19 W Center St., Logan, UT 84321",
    contact_email: "thealleyoncenter@gmail.com",
    contact_phone: "(435) 512-4608",
    social_instagram: "https://www.instagram.com/thealleyoncenter",
    social_facebook: "https://www.facebook.com/thealleyoncenter",
    // ---- per-page headings & intros (owner-editable via Site Content → Pages) ----
    about_hero_eyebrow: "Our story",
    about_hero_title: "More than a building; an invitation.",
    contact_hero_eyebrow: "Say hello",
    contact_hero_title: "Contact",
    contact_hero_lede:
      "Questions about a booking, the building, or becoming a tenant? Send us an email or stop by — we'd love to hear from you.",
    gallery_hero_subtitle: "The Alley · Gallery",
    gallery_hero_title: "A room is a canvas before it's a memory",
    gallery_hero_lede:
      "The spaces, the makers, and the gatherings that fill The Alley on Center — openings, markets, live music, and the everyday life of the building.",
    spaces_hero_eyebrow: "Rent a space",
    spaces_hero_title: "The Loft & more",
    spaces_hero_lede:
      "You bring the idea — we'll help with the space. From workshops and meetings to markets and celebrations, The Alley gives you a warm, characterful room where ideas turn into experiences.",
    spaces_book_heading: "Before you book",
    spaces_book_body:
      "Every booking includes a refundable {deposit} cleaning deposit and a quick rental agreement. We'll review your request and email you within a day to confirm — no charge happens until then.",
    directory_hero_eyebrow: "The makers",
    directory_hero_title: "Directory",
    directory_hero_lede:
      "Independent shops and practitioners who call The Alley home — clothing, cuts, ink, healing, and more, all under one roof.",
    directory_list_heading: "Full directory",
    directory_list_subhead: "Every business in the building, by category.",
    directory_leasing_blurb:
      "We're currently leasing studio + office space. Reach out and we'll show you what's open.",
    exhibitors_hero_eyebrow: "The artists",
    exhibitors_hero_title: "Exhibitors",
    exhibitors_hero_lede:
      "The painters, printers, potters and makers who've filled the gallery walls. Their work rotates each season — here's who's showing now, and everyone who came before.",
    exhibitors_cta_heading: "Want to show your work?",
    exhibitors_cta_blurb:
      "We host a new exhibitor most seasons — solo walls, group shows, and pop-ups. Tell us what you make.",
    calendar_hero_eyebrow: "What's on",
    calendar_hero_title: "Calendar",
    calendar_hero_lede:
      "Workshops, classes, markets, and gatherings hosted by our community. Each listing links you straight to the host — they handle their own tickets and payment.",
    // ---- structured marketing copy (JSON-valued, owner-editable) ----
    home_hero_eyebrow: "Logan, Utah · Est. 1995",
    home_hero_rotate: JSON.stringify(["MUSIC", "ART", "EVENTS", "COMMUNITY"]),
    home_hero_lede:
      "A space intentionally created in the heart of downtown Logan for artists, entrepreneurs, and dreamers to gather, create, and be seen. We designed the container — you bring the magic.",
    home_destinations: JSON.stringify([
      { title: "Spaces", blurb: "Host your gathering", href: "/spaces" },
      { title: "Directory", blurb: "Meet our makers & shops", href: "/directory" },
      { title: "Gallery", blurb: "Wander the building", href: "/gallery" },
      { title: "Calendar", blurb: "Classes & happenings", href: "/calendar" },
    ]),
    about_founders: JSON.stringify([
      {
        name: "Chelsea Funk",
        role: "Co-Founder",
        bio: "Owner of Presidio Real Estate Cache Valley and mother of four. Chelsea saw the untapped potential of her hometown and set out to create a space where local professionals can thrive and connect.",
      },
      {
        name: "Caylee Funk",
        role: "Co-Founder",
        bio: "Owner of Lucid Hair Collective. Caylee brings a fresh perspective to the creative space, with a dedication to fostering collaboration and innovation.",
      },
    ]),
    about_pillars: JSON.stringify([
      "Living Creative Ecosystem",
      "Space to Gather & Create",
      "Rooted in Local",
      "Community Over Competition",
      "Art in Everyday Life",
      "Intentional Design",
      "Events That Bring People Together",
      "Built by Community",
    ]),
    art_beat: JSON.stringify({
      date: "August 29, 2026 · Logan, Utah",
      intro:
        "We're amplifying the sounds of emerging artists and making room for everyone — artists, musicians, vendors, volunteers, and neighbors — to come together on Center Street.",
      ways: [
        ["Perform", "Musicians and performers — share your sound with the valley."],
        ["Vend", "Makers and small businesses — bring a booth and meet the community."],
        ["Volunteer", "Lend a hand setting up, running, and celebrating the day."],
        ["Share art", "Visual artists and creators — show your work where it'll be seen."],
      ],
    }),
  };

  const insertSetting = connection.prepare(
    "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)"
  );
  for (const [key, value] of Object.entries(settingDefaults)) {
    insertSetting.run(key, value);
  }

  // One-time bump of the recurring-series limits (flexible recurrence: monthly
  // patterns need a bigger span/count than the old 8-sessions / 31-days). Guarded
  // so it only forces the values once — an owner can still change them later.
  const bumped = connection
    .prepare("SELECT value FROM settings WHERE key = 'series_limits_bumped_v2'")
    .get();
  if (!bumped) {
    connection
      .prepare("INSERT INTO settings (key, value) VALUES ('series_max_occurrences', '26') ON CONFLICT(key) DO UPDATE SET value = '26'")
      .run();
    connection
      .prepare("INSERT INTO settings (key, value) VALUES ('series_max_span_days', '400') ON CONFLICT(key) DO UPDATE SET value = '400'")
      .run();
    connection
      .prepare("INSERT INTO settings (key, value) VALUES ('series_limits_bumped_v2', '1') ON CONFLICT(key) DO UPDATE SET value = '1'")
      .run();
  }
  const insertContent = connection.prepare(
    "INSERT OR IGNORE INTO site_content (key, value) VALUES (?, ?)"
  );
  for (const [key, value] of Object.entries(contentDefaults)) {
    insertContent.run(key, value);
  }

  // Seed one suite row per floor-plan zone (idempotent). Default name = the
  // zone code; the owner can rename it. New zones added to building-map appear
  // automatically; renamed display names are preserved.
  const insertSuite = connection.prepare(
    "INSERT OR IGNORE INTO suites (zone, name, floor, sort_order) VALUES (?, ?, ?, ?)"
  );
  SUITE_CODES.forEach((s, i) => {
    const name = s.code === "gallery" ? "Gallery" : s.code;
    insertSuite.run(s.code, name, s.floor, i);
  });
  // Suite 204 was retired when the upper floor was redrawn (that area is now the
  // Conference Room / Common Space — labels only, no longer a leasable zone).
  // Drop its stale row so the admin list and directory stay in sync with the map.
  // Guarded on occupancy so an assigned suite is never silently orphaned —
  // check both the legacy tenant_id and the junction table.
  connection
    .prepare(
      `DELETE FROM suites
         WHERE zone = '204'
           AND tenant_id IS NULL
           AND id NOT IN (SELECT suite_id FROM suite_tenants)`
    )
    .run();
}

// Lazily open the connection on first use (never at import time). This keeps
// `next build` from opening the database while collecting page data — the file
// is only touched when a query actually runs (i.e. when a visitor loads a page).
// The connection is cached on globalThis so it's reused across requests and
// survives dev hot reloads.
const globalForDb = globalThis;
function getConnection() {
  if (!globalForDb.__alleyDb) {
    globalForDb.__alleyDb = createConnection();
  }
  return globalForDb.__alleyDb;
}

export const db = new Proxy(
  {},
  {
    get(_target, prop) {
      const connection = getConnection();
      const value = connection[prop];
      return typeof value === "function" ? value.bind(connection) : value;
    },
  }
);

// ---------------------------------------------------------------------------
// Settings & site content helpers
// ---------------------------------------------------------------------------

export function getSettings() {
  const rows = db.prepare("SELECT key, value FROM settings").all();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function getSetting(key, fallback = null) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, String(value));
}

export function getContent() {
  const rows = db.prepare("SELECT key, value FROM site_content").all();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function getContentValue(key, fallback = "") {
  const row = db.prepare("SELECT value FROM site_content WHERE key = ?").get(key);
  return row ? row.value : fallback;
}

export function setContent(key, value) {
  db.prepare(
    "INSERT INTO site_content (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, value ?? "");
}

export default db;

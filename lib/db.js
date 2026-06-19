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
      status             TEXT NOT NULL DEFAULT 'pending', -- pending|held|confirmed|denied|completed|expired
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

    -- An exhibitor's individual works (art photos).
    CREATE TABLE IF NOT EXISTS exhibitor_photos (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      exhibitor_id INTEGER NOT NULL,
      image_path   TEXT NOT NULL,
      caption      TEXT,
      sort_order   INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (exhibitor_id) REFERENCES exhibitors(id) ON DELETE CASCADE
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
  `);

  // Additive column migrations for databases created before these columns existed.
  ensureColumn(connection, "directory", "contact_email", "contact_email TEXT");
  ensureColumn(connection, "directory", "edit_token", "edit_token TEXT");
  ensureColumn(connection, "directory", "suite", "suite TEXT");
  ensureColumn(connection, "directory", "floor", "floor TEXT");
  ensureColumn(connection, "gallery", "tags", "tags TEXT");
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

  seedDefaults(connection);
}

/** Add a column to a table if it doesn't already exist (idempotent migration). */
function ensureColumn(connection, table, column, ddl) {
  const cols = connection.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    connection.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

/** Default settings + site content. Idempotent — only inserts missing keys. */
function seedDefaults(connection) {
  const settingDefaults = {
    standard_rate: "75",
    minimum_hours: "2",
    deposit: "150",
    open_hour: "8", // 8 AM
    close_hour: "23", // 11 PM
    cleanup_buffer_minutes: "60",
    payment_window_days: "3",
    listing_auto_publish: "false", // owner-review by default (section 5b)
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

import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

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

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, "alley.db");

function createConnection() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const connection = new Database(DB_PATH);
  connection.pragma("journal_mode = WAL");
  connection.pragma("foreign_keys = ON");
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
      sort_order    INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS gallery (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      image_path TEXT NOT NULL,
      caption    TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
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

  seedDefaults(connection);
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
}

// Cache the connection across hot reloads in dev.
const globalForDb = globalThis;
export const db = globalForDb.__alleyDb ?? createConnection();
if (process.env.NODE_ENV !== "production") {
  globalForDb.__alleyDb = db;
}

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

import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { SUITE_CODES } from "./building-map.js";
import { SPACES } from "./constants.js";
import { headers } from "next/headers.js";

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

// A starting point for Chelsea to edit (Makers → Consignment terms) — marked
// as a draft in the admin until she saves her own version.
const DEFAULT_CONSIGNMENT_TERMS = `1. What we sell for you. You bring finished, ready-to-sell items. We display them in the shop, ring them up on our register, and add Utah sales tax on top of your price.

2. Your share. You get {split}% of what each item sells for (after any discount, before sales tax). The Alley keeps the rest.

3. Getting paid. We pay you once a month for everything that sold the month before. If something is returned after we've paid you for it, your share of it comes off your next payout. Your sales and payouts are in your account any time.

4. Prices. You set your prices when you list a drop-off. If we think a price should change, we'll ask you first.

5. Drop-offs. List your items in your account before you come in. We count them with you at drop-off — the count we accept is the one on record.

6. How long items stay. Items stay on the shelf for up to {days} days. After that we'll ask you to pick up or swap anything that hasn't sold.

7. Care of your items. We take reasonable care of everything in the shop, but The Alley isn't responsible for loss, theft or damage it didn't cause.

8. Picking up. Let us know before you come for unsold items so we can have them ready and take them off the register.

9. Ending. Either of us can end this at any time. Anything sold up to then is paid at the next monthly payout.`;

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

    -- One private "all my bookings" link per client, keyed by their email.
    -- Every other self-service token in this schema hangs off the row it edits
    -- (a booking, a listing, a directory entry); this one can't, because it
    -- spans every booking a person has ever made. The email is the identity, so
    -- it's stored lowercased and matched that way — see lib/portal.js.
    CREATE TABLE IF NOT EXISTS client_portals (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      email        TEXT NOT NULL UNIQUE,   -- always lowercased + trimmed
      token        TEXT NOT NULL UNIQUE,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen_at TEXT,
      announced_at TEXT   -- when we told them their dashboard exists (once only)
    );

    CREATE INDEX IF NOT EXISTS idx_bookings_space_date ON bookings(space, date);
    CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
    CREATE INDEX IF NOT EXISTS idx_bookings_client_email ON bookings(client_email);
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
  // One person, one agreement date. A gallery artist whose work is also on
  // consignment in the shop is linked to their maker record (vendor_id), and
  // the maker's agreement_ends (added with the vendors table) is the date for both.
  ensureColumn(connection, "exhibitors", "vendor_id", "vendor_id INTEGER REFERENCES vendors(id)");
  // Reminders that someone's consignment agreement is ending (a month out and a
  // week out). party = 'maker' (vendors) or 'artist' (an exhibitor with no maker
  // record). One row per person, kind and end date, so moving the date brings the
  // reminders back. skipped = handled another way (a call, in person).
  connection.exec(`
    CREATE TABLE IF NOT EXISTS agreement_reminders (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      party     TEXT NOT NULL,
      party_id  INTEGER NOT NULL,
      kind      TEXT NOT NULL,
      ends_on   TEXT NOT NULL,
      skipped   INTEGER NOT NULL DEFAULT 0,
      subject   TEXT,
      sent_to   TEXT,
      sent_by   TEXT,
      sent_at   TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (party, party_id, kind, ends_on)
    );
    -- When the team was emailed that a reminder is waiting (so it's not missed
    -- over a weekend), and how many times.
    CREATE TABLE IF NOT EXISTS agreement_alerts (
      party     TEXT NOT NULL,
      party_id  INTEGER NOT NULL,
      kind      TEXT NOT NULL,
      ends_on   TEXT NOT NULL,
      times     INTEGER NOT NULL DEFAULT 0,
      last_at   TEXT,
      PRIMARY KEY (party, party_id, kind, ends_on)
    );
  `);
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
  // Venue-local date a host-details reminder was last auto-sent (host-reminders
  // cron): nudge a placeholder listing whose host hasn't posted, every ~3 days.
  ensureColumn(connection, "events", "host_reminder_last_sent", "host_reminder_last_sent TEXT");
  // Guest-facing times, separate from `time` (which mirrors the booking start).
  // Hosts reserve extra time for setup, so the room may be theirs from 5:00 PM
  // while guests are told 6:00 PM. NULL = fall back to the reservation start.
  ensureColumn(connection, "events", "public_time", "public_time TEXT");
  ensureColumn(connection, "events", "public_end_time", "public_end_time TEXT");
  // Owner override flag: when 1, a held/unpaid booking is intentionally kept on
  // the calendar and is exempt from BOTH auto-expiry paths (payment window AND
  // event-date). Distinguishes a real "worked-out deal" from a lapsed hold.
  ensureColumn(connection, "bookings", "keep_on_calendar", "keep_on_calendar INTEGER NOT NULL DEFAULT 0");
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
  // This session's own name, when the client named their sessions individually
  // at booking ("Week 2: Glazing"). event_title stays the series name on every
  // row; NULL here means this date just uses it. Seeds the public listing's
  // per-session titles so an approved series hits the calendar already correct.
  ensureColumn(connection, "bookings", "session_title", "session_title TEXT");
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

  // Client self-service rescheduling. The token is the only credential on the
  // private "change my date" link, so it's minted lazily when an email that
  // carries the link goes out (ensureRescheduleToken) rather than backfilled
  // onto every historical row — a bulk backfill would mint live credentials for
  // cancelled, denied and long-past bookings nobody will ever use.
  ensureColumn(connection, "bookings", "reschedule_token", "reschedule_token TEXT");
  ensureColumn(connection, "bookings", "rescheduled_at", "rescheduled_at TEXT");
  ensureColumn(connection, "bookings", "reschedule_count", "reschedule_count INTEGER NOT NULL DEFAULT 0");
  // UNIQUE has to live in an index, not the column: SQLite's ALTER TABLE ADD
  // COLUMN rejects a UNIQUE constraint outright. NULLs are distinct in a SQLite
  // unique index, so every un-tokened row coexists happily.
  connection.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_reschedule_token ON bookings(reschedule_token)"
  );

  // Multi-user admin accounts (accountability layer). Additive on admin_users so
  // the existing single-owner row is preserved; new columns backfill sensibly
  // (active by default, role 'user' unless promoted by the owner seeder).
  // A directory tenant can post their own in-store events to the public calendar
  // (a book signing, a recurring evening). These are LISTINGS ONLY: they carry no
  // booking_id, and availability is computed from bookings + closures alone, so
  // they never reserve a space. tenant_id says who posted it, which scopes a
  // tenant's edits to their OWN events and lets their listing page show them.
  ensureColumn(connection, "events", "tenant_id", "tenant_id INTEGER REFERENCES directory(id)");
  connection.exec("CREATE INDEX IF NOT EXISTS idx_events_tenant ON events(tenant_id)");

  // When a tenant was told they can post their own events (one-off, see lib/announce.js).
  ensureColumn(connection, "directory", "events_announced_at", "events_announced_at TEXT");
  ensureColumn(connection, "client_portals", "announced_at", "announced_at TEXT");

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
  // Set when an owner invites someone; their reset_token is then the invite
  // link (valid a week) until they choose a password.
  ensureColumn(connection, "admin_users", "invited_at", "invited_at TEXT");

  // ── Staff: employees + the shift schedule ──────────────────────────────────
  // An employee is a person on the schedule; their pay and hours live in Square
  // Payroll and Square's timecards. Their login, if they have one, is an
  // admin_users row with role 'staff' — kept separate so
  // someone can be scheduled before they're given a login, and so an owner or
  // admin who also works shifts is simply an employee linked to their own login.
  // ics_token is the only credential on their personal calendar feed, minted on
  // first use (lib/staff.js ensureIcsToken).
  connection.exec(`
    CREATE TABLE IF NOT EXISTS employees (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_user_id INTEGER REFERENCES admin_users(id),
      name          TEXT NOT NULL,
      email         TEXT,
      phone         TEXT,
      color         TEXT,
      hire_date     TEXT,
      end_date      TEXT,
      is_active     INTEGER NOT NULL DEFAULT 1,
      ics_token     TEXT,
      notes         TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_user ON employees(admin_user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_ics ON employees(ics_token);

    -- One scheduled shift. date + start/end are venue-local wall clock, like
    -- bookings; an end at or before the start runs past midnight. employee_id
    -- NULL = an open shift nobody's been put on yet. New shifts are drafts —
    -- staff only ever see 'published' ones.
    CREATE TABLE IF NOT EXISTS shifts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER REFERENCES employees(id),
      date        TEXT NOT NULL,
      start_time  TEXT NOT NULL,
      end_time    TEXT NOT NULL,
      role        TEXT,
      note        TEXT,
      booking_id  INTEGER REFERENCES bookings(id),
      event_id    INTEGER REFERENCES events(id),
      status      TEXT NOT NULL DEFAULT 'draft',
      created_by  INTEGER,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_shifts_date ON shifts(date);
    CREATE INDEX IF NOT EXISTS idx_shifts_employee ON shifts(employee_id, date);

    -- Shared staff cost: the tenants and the shop split what the staff cost
    -- each month. One row per month ('YYYY-MM'), built from Square timecards;
    -- detail = JSON { people: [...], warnings: [...] } as it was built.
    CREATE TABLE IF NOT EXISTS staff_cost_months (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      month          TEXT NOT NULL UNIQUE,
      hours          REAL NOT NULL DEFAULT 0,
      ot_hours       REAL NOT NULL DEFAULT 0,
      wages          REAL NOT NULL DEFAULT 0,
      tax_pct        REAL NOT NULL DEFAULT 0,
      taxes          REAL NOT NULL DEFAULT 0,
      fees           REAL NOT NULL DEFAULT 0,
      adjustment     REAL NOT NULL DEFAULT 0,
      override_total REAL,
      total          REAL NOT NULL DEFAULT 0,
      note           TEXT,
      detail         TEXT,
      built_at       TEXT,
      notified_at    TEXT,
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Each party's share of a month. directory_id NULL = the shop's own share,
    -- recorded but never invoiced. attempt is part of the Square idempotency
    -- key, bumped only when a cancelled share is billed again.
    CREATE TABLE IF NOT EXISTS staff_cost_shares (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      month_id          INTEGER NOT NULL REFERENCES staff_cost_months(id) ON DELETE CASCADE,
      directory_id      INTEGER REFERENCES directory(id) ON DELETE SET NULL,
      name              TEXT NOT NULL,
      email             TEXT,
      amount            REAL NOT NULL,
      status            TEXT NOT NULL DEFAULT 'draft',
      square_invoice_id TEXT,
      payment_link      TEXT,
      attempt           INTEGER NOT NULL DEFAULT 1,
      error             TEXT,
      sent_at           TEXT,
      sent_by           TEXT,
      paid_at           TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_staff_cost_shares_month ON staff_cost_shares(month_id);

    -- Who has been told about accounts (one row per address, whichever version
    -- they got), so nobody hears about it twice.
    CREATE TABLE IF NOT EXISTS account_announcements (
      email    TEXT PRIMARY KEY,
      audience TEXT NOT NULL,
      sent_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- The building's own bills (Money page). An account is a bill that comes
    -- every month — the mortgage, power, gas — with a usual amount, a due day,
    -- and optionally a co-payer's share (Jay, who owns the basement, pays a
    -- third of the utilities). Each month gets one row per account: the real
    -- amount once the bill arrives, and when it was paid.
    CREATE TABLE IF NOT EXISTS expense_accounts (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      name           TEXT NOT NULL,
      category       TEXT NOT NULL DEFAULT 'other',
      typical_amount REAL,
      due_day        INTEGER,
      share_pct      REAL NOT NULL DEFAULT 0,
      share_name     TEXT,
      share_email    TEXT,
      is_active      INTEGER NOT NULL DEFAULT 1,
      sort_order     INTEGER NOT NULL DEFAULT 0,
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS expenses (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL REFERENCES expense_accounts(id) ON DELETE CASCADE,
      month      TEXT NOT NULL,
      amount     REAL,
      due_date   TEXT,
      paid_on    TEXT,
      note       TEXT,
      UNIQUE (account_id, month)
    );
    -- Rent a tenant has paid for a month (marked by hand, or matched to Square).
    CREATE TABLE IF NOT EXISTS rent_payments (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      directory_id INTEGER NOT NULL REFERENCES directory(id) ON DELETE CASCADE,
      month        TEXT NOT NULL,
      amount       REAL NOT NULL,
      received_on  TEXT NOT NULL,
      note         TEXT,
      UNIQUE (directory_id, month)
    );
    -- One bill a month to each co-payer for their share of that month's bills.
    CREATE TABLE IF NOT EXISTS share_bills (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      month             TEXT NOT NULL,
      name              TEXT NOT NULL,
      email             TEXT,
      amount            REAL NOT NULL,
      detail            TEXT,
      status            TEXT NOT NULL DEFAULT 'sent',
      square_invoice_id TEXT,
      payment_link      TEXT,
      attempt           INTEGER NOT NULL DEFAULT 1,
      error             TEXT,
      sent_at           TEXT,
      paid_at           TEXT,
      UNIQUE (month, name)
    );

    INSERT OR IGNORE INTO settings (key, value) VALUES ('staff_cost_tax_pct', '7.65');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('staff_cost_monthly_fees', '0');
  `);
  // Which directory businesses pay a share, and where their bill goes (blank =
  // their contact email).
  ensureColumn(connection, "directory", "shares_staff_cost", "shares_staff_cost INTEGER NOT NULL DEFAULT 0");
  ensureColumn(connection, "directory", "billing_email", "billing_email TEXT");
  // Rent: what the owner tells a tenant they pay each month, and the link to
  // pay it (a Square recurring invoice or payment link). Shown on the tenant's
  // account and business page beside their staff-cost bills.
  ensureColumn(connection, "directory", "rent_amount", "rent_amount REAL");
  ensureColumn(connection, "directory", "rent_link", "rent_link TEXT");
  // A starter set of the building's monthly bills, once, so the Money page has
  // something to fill in. Utilities start with Jay's third (he owns the basement).
  if (!connection.prepare("SELECT COUNT(*) AS n FROM expense_accounts").get().n) {
    const add = connection.prepare(
      "INSERT INTO expense_accounts (name, category, due_day, share_pct, share_name, sort_order) VALUES (?, ?, ?, ?, ?, ?)"
    );
    [
      ["Mortgage", "mortgage", 1, 0, null],
      ["Power", "utility", 15, 33.33, "Jay"],
      ["Gas", "utility", 15, 33.33, "Jay"],
      ["Water, sewer & garbage", "utility", 15, 33.33, "Jay"],
      ["Internet & phone", "utility", 15, 0, null],
      ["Building insurance", "insurance", 1, 0, null],
    ].forEach((r, i) => add.run(...r, i));
  }

  // ── Retail inventory ───────────────────────────────────────────────────────
  // The website is where stock is RECEIVED — it knows who brought it, what it
  // cost and the consignment split; Square is the register and owns the live
  // counts and the sales. A vendor is either a consignor (paid a share when an
  // item sells) or a supplier (Chelsea bought the stock outright). Money is
  // dollars as REAL, like the rest of this schema.
  connection.exec(`
    CREATE TABLE IF NOT EXISTS vendors (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      name               TEXT NOT NULL,
      kind               TEXT NOT NULL DEFAULT 'consignor',
      contact_name       TEXT,
      email              TEXT,
      phone              TEXT,
      default_split      REAL,
      payout_method      TEXT,
      notes              TEXT,
      square_category_id TEXT,
      portal_token       TEXT,
      is_active          INTEGER NOT NULL DEFAULT 1,
      created_at         TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_vendors_portal ON vendors(portal_token);

    -- One thing on the shelf. ownership 'owned' = bought (unit_cost is what it
    -- cost); 'consignment' = the vendor's until sold (split = THEIR % of the
    -- sale, overriding the vendor's default). qty_on_hand mirrors Square's count
    -- as of synced_at.
    CREATE TABLE IF NOT EXISTS inventory_items (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_id           INTEGER REFERENCES vendors(id),
      name                TEXT NOT NULL,
      sku                 TEXT,
      ownership           TEXT NOT NULL DEFAULT 'consignment',
      unit_cost           REAL,
      price               REAL NOT NULL,
      split               REAL,
      qty_received        INTEGER NOT NULL DEFAULT 0,
      qty_on_hand         INTEGER NOT NULL DEFAULT 0,
      square_item_id      TEXT,
      square_variation_id TEXT,
      status              TEXT NOT NULL DEFAULT 'active',
      notes               TEXT,
      created_at          TEXT NOT NULL DEFAULT (datetime('now')),
      synced_at           TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_items_sku ON inventory_items(sku);
    CREATE INDEX IF NOT EXISTS idx_items_vendor ON inventory_items(vendor_id);
    CREATE INDEX IF NOT EXISTS idx_items_variation ON inventory_items(square_variation_id);

    -- The digital version of Chelsea's paper sheet: who brought what in, when,
    -- at what price, and who signed for it.
    CREATE TABLE IF NOT EXISTS stock_intakes (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_id     INTEGER REFERENCES vendors(id),
      received_on   TEXT NOT NULL,
      received_by   TEXT NOT NULL,
      signed_name   TEXT,
      notes         TEXT,
      square_status TEXT NOT NULL DEFAULT 'pending',
      square_error  TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS stock_intake_lines (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      intake_id INTEGER NOT NULL REFERENCES stock_intakes(id),
      item_id   INTEGER NOT NULL REFERENCES inventory_items(id),
      qty       INTEGER NOT NULL,
      price     REAL NOT NULL,
      unit_cost REAL,
      split     REAL,
      price_changed INTEGER NOT NULL DEFAULT 0  -- re-stocked at a new price: Square's needs updating
    );
    CREATE INDEX IF NOT EXISTS idx_intake_lines ON stock_intake_lines(intake_id);

    -- Every line of every completed Square order, copied down nightly. kind:
    -- retail (an item from the catalog or a custom amount at the register),
    -- rental / deposit (the booking invoices this site creates). A return is
    -- stored as its own row with negative qty and money. net = after discounts,
    -- before tax — what a consignment split is taken from.
    CREATE TABLE IF NOT EXISTS retail_sales (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      square_order_id  TEXT NOT NULL,
      line_uid         TEXT NOT NULL,
      is_return        INTEGER NOT NULL DEFAULT 0,
      sold_at          TEXT NOT NULL,
      kind             TEXT NOT NULL DEFAULT 'retail',
      item_id          INTEGER REFERENCES inventory_items(id),
      catalog_object_id TEXT,
      name             TEXT,
      qty              REAL NOT NULL,
      gross            REAL NOT NULL DEFAULT 0,
      discount         REAL NOT NULL DEFAULT 0,
      net              REAL NOT NULL DEFAULT 0,
      tax              REAL NOT NULL DEFAULT 0,
      total            REAL NOT NULL DEFAULT 0,
      payout_id        INTEGER,
      created_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_line ON retail_sales(square_order_id, line_uid, is_return);

    -- Every completed Square refund (lib/inventory.js saveRefunds). Most match
    -- returned lines on an order; the ones that don't were given back as an
    -- amount and are listed on the Sales page to be sorted out by hand.
    CREATE TABLE IF NOT EXISTS square_refunds (
      id          TEXT PRIMARY KEY,
      payment_id  TEXT,
      order_id    TEXT,
      amount      REAL NOT NULL DEFAULT 0,
      status      TEXT NOT NULL DEFAULT '',
      reason      TEXT,
      created_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sales_sold ON retail_sales(sold_at);
    CREATE INDEX IF NOT EXISTS idx_sales_item ON retail_sales(item_id);

    -- Money paid out to a consignor, and which sales it covered (retail_sales.payout_id).
    CREATE TABLE IF NOT EXISTS consignor_payouts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_id   INTEGER NOT NULL REFERENCES vendors(id),
      through     TEXT NOT NULL,
      amount      REAL NOT NULL,
      sales_total REAL NOT NULL,
      line_count  INTEGER NOT NULL,
      method      TEXT,
      reference   TEXT,
      paid_on     TEXT NOT NULL,
      created_by  TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT OR IGNORE INTO settings (key, value) VALUES ('consignment_default_split', '60');
  `);

  // Tickets The Alley sells ITSELF for its own events (not a renter's). The
  // ticket is a taxed Square catalog item, so sales tax is added at checkout and
  // at the register alike; capacity is that item's Square stock count.
  ensureColumn(connection, "events", "ticket_price", "ticket_price REAL");
  ensureColumn(connection, "events", "ticket_capacity", "ticket_capacity INTEGER"); // NULL = no limit
  ensureColumn(connection, "events", "ticket_sales_open", "ticket_sales_open INTEGER NOT NULL DEFAULT 0");
  ensureColumn(connection, "events", "square_ticket_item_id", "square_ticket_item_id TEXT");
  ensureColumn(connection, "events", "square_ticket_variation_id", "square_ticket_variation_id TEXT");

  // ── Maker drop-offs, consignment terms and price tags ──────────────────────
  // A maker lists what they're bringing (a drop-off) from their account or
  // private link; staff count it in and accept it, which turns it into a
  // stock_intakes sheet like any other (intake_id). Lines are only a proposal
  // until then — item_id is set when it's a restock of something they already have.
  connection.exec(`
    CREATE TABLE IF NOT EXISTS dropoffs (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_id      INTEGER NOT NULL REFERENCES vendors(id),
      status         TEXT NOT NULL DEFAULT 'submitted', -- submitted|accepted|declined|cancelled
      notes          TEXT,
      submitted_by   TEXT,
      intake_id      INTEGER REFERENCES stock_intakes(id),
      decided_by     TEXT,
      decided_at     TEXT,
      decline_reason TEXT,
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_dropoffs_vendor ON dropoffs(vendor_id, status);
    CREATE TABLE IF NOT EXISTS dropoff_lines (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      dropoff_id INTEGER NOT NULL REFERENCES dropoffs(id),
      item_id    INTEGER REFERENCES inventory_items(id),
      name       TEXT NOT NULL,
      qty        INTEGER NOT NULL,
      price      REAL NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_dropoff_lines ON dropoff_lines(dropoff_id);

    -- A sheet of price tags waiting to print: items_json is
    -- [{ variationId, qty }]. Kept so a reprint is one click.
    CREATE TABLE IF NOT EXISTS tag_prints (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      format      TEXT NOT NULL,
      start_at    INTEGER NOT NULL DEFAULT 1,
      items_json  TEXT NOT NULL,
      created_by  TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- The terms a maker agrees to before listing anything. {split} and {days}
    -- are filled in from the settings below. These are the general terms, for
    -- makers who haven't agreed yet; someone can also have their own
    -- (vendors.terms_text), and whoever has agreed keeps the words they signed.
    INSERT OR IGNORE INTO settings (key, value) VALUES ('consignment_pickup_days', '90');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('consignment_terms_draft', '1');
    -- Next number for barcodes given to items made straight in Square.
    INSERT OR IGNORE INTO settings (key, value) VALUES ('square_sku_next', '1');
  `);
  connection
    .prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('consignment_terms', ?)")
    .run(DEFAULT_CONSIGNMENT_TERMS);
  ensureColumn(connection, "vendors", "terms_version", "terms_version TEXT");
  // Unsaved edits from the Pages editor, for its live preview only (getContent).
  connection.exec(`
    CREATE TABLE IF NOT EXISTS content_drafts (
      id         TEXT PRIMARY KEY,
      data       TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  // When this maker's consignment agreement ends (lib/agreement-reminders.js).
  ensureColumn(connection, "vendors", "agreement_ends", "agreement_ends TEXT");
  ensureColumn(connection, "vendors", "terms_accepted_at", "terms_accepted_at TEXT");
  ensureColumn(connection, "vendors", "terms_accepted_name", "terms_accepted_name TEXT");
  ensureColumn(connection, "vendors", "terms_accepted_text", "terms_accepted_text TEXT");
  // 'barcode' or 'qr' — both carry the item's SKU.
  ensureColumn(connection, "tag_prints", "code", "code TEXT NOT NULL DEFAULT 'barcode'");
  // The stock sheet a print was made from, so the dashboard knows its tags are done.
  ensureColumn(connection, "tag_prints", "intake_id", "intake_id INTEGER REFERENCES stock_intakes(id)");
  // Price tags still to print for things added or restocked in Square itself
  // (lib/tag-watch.js). Stock that came in, as Square recorded it…
  connection.exec(`
    CREATE TABLE IF NOT EXISTS square_stock_in (
      id           TEXT PRIMARY KEY,
      variation_id TEXT NOT NULL,
      qty          INTEGER NOT NULL,
      occurred_at  TEXT NOT NULL
    );
    -- …and the names of what's been seen, plus whether it was new to the catalog.
    CREATE TABLE IF NOT EXISTS square_variations_seen (
      variation_id   TEXT PRIMARY KEY,
      name           TEXT NOT NULL DEFAULT '',
      variation_name TEXT NOT NULL DEFAULT '',
      category       TEXT NOT NULL DEFAULT '',
      created_at     TEXT,
      is_new         INTEGER NOT NULL DEFAULT 0
    );
  `);
  // The maker's split as it was when the line synced, so a later change to it
  // never re-prices sales already made (lib/inventory.js consignorShare).
  ensureColumn(connection, "retail_sales", "split", "split REAL");
  // When a push to Square started, so one that died part-way can be retried.
  ensureColumn(connection, "stock_intakes", "square_push_started_at", "square_push_started_at TEXT");
  // A maker's item that was typed straight into Square and linked to them
  // later: when (venue time). Sales before then were settled the old way.
  ensureColumn(connection, "inventory_items", "linked_at", "linked_at TEXT");
  // Optional, website-only: a maker's own grouping ("Large Candle", with each
  // scent its own item) for their sales breakdown — Square never sees it — and
  // what one piece costs them to make, so they can see their profit. Private
  // to the maker; nothing in the books or payouts reads it.
  ensureColumn(connection, "inventory_items", "item_group", "item_group TEXT");
  ensureColumn(connection, "inventory_items", "maker_cost", "maker_cost REAL");
  ensureColumn(connection, "dropoff_lines", "item_group", "item_group TEXT");
  // An optional photo of the piece (an upload path), from the maker or artist.
  ensureColumn(connection, "inventory_items", "photo", "photo TEXT");
  ensureColumn(connection, "dropoff_lines", "photo", "photo TEXT");
  // The share (%) a maker or artist agreed to, so a later change can tell them
  // what it was and what it is now.
  ensureColumn(connection, "vendors", "terms_accepted_split", "terms_accepted_split REAL");
  // One person's own terms ({split} and {days} still filled in), or NULL for
  // the general ones; set to what they signed when they agree, so later edits
  // to the general terms don't touch them. terms_changed_at: when The Alley
  // last changed their terms (after they'd agreed, they're asked again).
  ensureColumn(connection, "vendors", "terms_text", "terms_text TEXT");
  ensureColumn(connection, "vendors", "terms_changed_at", "terms_changed_at TEXT");
  // A room photo's crop box from the Pages editor (lib/crop.js JSON), or NULL.
  ensureColumn(connection, "space_photos", "crop", "crop TEXT");
  // The split is 60/40 — the maker or artist gets 60% — not the 70% first
  // seeded. Once: the shop default and anyone typed in at 70% move to 60%, and
  // sales not yet paid out are worked out at 60%. Payouts already made stay as paid.
  if (!connection.prepare("SELECT 1 FROM settings WHERE key = 'split_60_applied'").get()) {
    connection.transaction(() => {
      connection.prepare("UPDATE settings SET value = '60' WHERE key = 'consignment_default_split' AND value = '70'").run();
      connection.prepare("UPDATE vendors SET default_split = NULL WHERE default_split = 70").run();
      connection.prepare("UPDATE inventory_items SET split = NULL WHERE split = 70").run();
      connection.prepare("UPDATE retail_sales SET split = 60 WHERE split = 70 AND payout_id IS NULL").run();
      connection.prepare("INSERT INTO settings (key, value) VALUES ('split_60_applied', datetime('now'))").run();
    })();
  }

  // ── A maker's or artist's record, which they and the team both see ─────────
  // vendor_agreements: every time they agree to the terms — the name they
  // typed, when, the share and the exact words (vendors.terms_accepted_* only
  // keeps the latest). vendor_events: what happened with them that has no table
  // of its own — the terms or their share changing, a reminder, how they're paid.
  // A stock sheet is confirmed by the maker on their own page (confirmed_*).
  connection.exec(`
    CREATE TABLE IF NOT EXISTS vendor_agreements (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_id   INTEGER NOT NULL REFERENCES vendors(id),
      accepted_at TEXT NOT NULL,
      name        TEXT NOT NULL,
      split       REAL,
      text        TEXT NOT NULL,
      version     TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_vendor_agreements_vendor ON vendor_agreements(vendor_id);
    CREATE TABLE IF NOT EXISTS vendor_events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_id  INTEGER NOT NULL REFERENCES vendors(id),
      kind       TEXT NOT NULL,
      summary    TEXT NOT NULL,
      by_name    TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_vendor_events_vendor ON vendor_events(vendor_id);
  `);
  ensureColumn(connection, "stock_intakes", "confirmed_at", "confirmed_at TEXT");
  ensureColumn(connection, "stock_intakes", "confirmed_name", "confirmed_name TEXT");
  // Agreements from before this table: their latest one, once.
  connection
    .prepare(
      `INSERT INTO vendor_agreements (vendor_id, accepted_at, name, split, text, version)
       SELECT v.id, v.terms_accepted_at, COALESCE(v.terms_accepted_name, ''), v.terms_accepted_split, v.terms_accepted_text, v.terms_version
         FROM vendors v
        WHERE v.terms_accepted_at IS NOT NULL AND v.terms_accepted_text IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM vendor_agreements a WHERE a.vendor_id = v.id AND a.accepted_at = v.terms_accepted_at)`
    )
    .run();

  // ── Accounts (makers, renters, hosts, tenants, exhibitors) ─────────────────
  // One sign-in per email address for everyone outside the team. An account
  // owns nothing itself: what it shows is whatever already carries that email
  // (bookings.client_email, events.host_email, directory/exhibitors
  // contact_email, vendors.email) — which is why nothing is shown until the
  // address is proven (email_verified_at). Separate from admin_users on purpose:
  // a public sign-up must never be one role change away from the admin.
  // account_tokens are single-use sign-in / reset links, stored hashed.
  connection.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      email             TEXT NOT NULL UNIQUE,
      name              TEXT,
      password_hash     TEXT,
      email_verified_at TEXT,
      is_active         INTEGER NOT NULL DEFAULT 1,
      last_login_at     TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS account_tokens (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id  INTEGER NOT NULL REFERENCES accounts(id),
      purpose     TEXT NOT NULL, -- signin | reset
      token_hash  TEXT NOT NULL UNIQUE,
      expires_at  TEXT NOT NULL,
      used_at     TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- A copy of every email sent TO a customer (not the owners' notifications),
    -- one row per recipient, for their account's inbox. mode 'inbox' = posted
    -- to the inbox only, never emailed (e.g. a payout statement).
    CREATE TABLE IF NOT EXISTS sent_emails (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      to_email    TEXT NOT NULL,
      subject     TEXT NOT NULL,
      html        TEXT NOT NULL,
      attachments TEXT,
      mode        TEXT,
      ok          INTEGER NOT NULL DEFAULT 1,
      sent_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sent_emails_to ON sent_emails(to_email, sent_at);
  `);
  // How a paid Square invoice was paid (lib/payment-details.js), for the
  // customer's Activity: card brand + last four only, Square's receipt link and
  // number, the invoice page. method NULL = paid, but not through Square.
  connection.exec(`
    CREATE TABLE IF NOT EXISTS invoice_payments (
      invoice_id     TEXT PRIMARY KEY,
      payment_id     TEXT,
      method         TEXT,
      card_brand     TEXT,
      last4          TEXT,
      receipt_url    TEXT,
      receipt_number TEXT,
      invoice_url    TEXT,
      invoice_number TEXT,
      amount         REAL,
      paid_at        TEXT,
      fetched_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  // Bumped on every password change/reset; a session carrying an older number is refused.
  ensureColumn(connection, "accounts", "session_version", "session_version INTEGER NOT NULL DEFAULT 0");

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
  for (const { id } of SPACES) {
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
    // ---- notification routing (see lib/notify.js) ----
    // Comma-separated lists, editable in admin → Settings. Requests need someone
    // who can approve them; the upcoming-event digests are a wider heads-up.
    // An empty box falls back to the OWNER_EMAIL env var, never to nothing.
    notify_requests: "chelseafunkhomes@gmail.com",
    notify_reminders: "chelseafunkhomes@gmail.com, thealleyoncenter@gmail.com",
    reply_to_email: "", // blank = inherit EMAIL_REPLY_TO
    // How many days ahead the "happening soon" digest looks. The morning-of
    // digest always covers today.
    event_reminder_lead_days: "2",
    // Rescheduling. Clients can move their own booking only while it's at least
    // this many days out; the owner can override inside the window. The cap
    // limits calendar churn from the self-service link (owner moves are
    // unlimited).
    reschedule_notice_days: "14",
    reschedule_max_client_moves: "2",
    // ---- per-space overrides (see lib/spaces.js) ----
    // Any `space_<id>_<key>` wins over the matching global above; a blank or
    // missing key means that space inherits. Only the Conference Room differs:
    // it rents at $25/hour with a 1-hour minimum and a 30-minute cleanup gap.
    // Main Floor + Loft set nothing, so they keep using the globals.
    space_conference_standard_rate: "25",
    space_conference_minimum_hours: "1",
    space_conference_cleanup_buffer_minutes: "30",
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
    spaces_listing_heading: "Hosting something the public can join?",
    spaces_listing_body:
      "Tick the public event box when you book and we'll list your class, workshop or show on The Alley's calendar — free. Once your booking is confirmed we email you a private link where you add your description, flyer or photos, PDFs, how many spots you have, and how people pay you. Booking several dates at once? They share one listing (and one deposit), and you can give each session its own details.",
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
  // One-time backfill for the new keep_on_calendar flag. Before this flag, the
  // ONLY signal that a hold was intentionally kept was a null payment deadline
  // (that's what the old "Keep on calendar" override did). So mark every existing
  // held-with-no-deadline booking as kept — protecting real deals from the new
  // event-date auto-expiry. Erring toward keep is safe (owner can un-keep);
  // erring the other way could wrongly expire a deal and reopen its slot.
  const kocBackfilled = connection
    .prepare("SELECT value FROM settings WHERE key = 'keep_on_calendar_backfilled'")
    .get();
  if (!kocBackfilled) {
    connection
      .prepare(
        "UPDATE bookings SET keep_on_calendar = 1 WHERE status = 'held' AND (hold_expires_at IS NULL OR hold_expires_at = '')"
      )
      .run();
    connection
      .prepare("INSERT INTO settings (key, value) VALUES ('keep_on_calendar_backfilled', '1') ON CONFLICT(key) DO UPDATE SET value = '1'")
      .run();
  }

  // One-time backfill: length + buffer rules move from ONE global box to a box
  // per space. They were duplicated in the admin — a global "Minimum booking
  // length" alongside a per-space "Minimum" that silently inherited it — so the
  // globals are coming out of the UI and each space now carries its own number.
  //
  // Copies whatever the globals are RIGHT NOW (not the seeded defaults, which
  // the owner has since changed) into any space that has no override, so every
  // space keeps behaving exactly as it does today. The Conference Room already
  // overrides minimum + buffer; those are left alone and it just picks up the
  // shared maximum. The global keys stay in `settings` as the fallback for a
  // space added later with an empty box.
  const perSpaceBackfilled = connection
    .prepare("SELECT value FROM settings WHERE key = 'per_space_rules_backfilled'")
    .get();
  if (!perSpaceBackfilled) {
    const readSetting = connection.prepare("SELECT value FROM settings WHERE key = ?");
    const writeSetting = connection.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    );
    const blank = (v) => v === null || v === undefined || String(v).trim() === "";
    for (const key of ["minimum_hours", "maximum_hours", "cleanup_buffer_minutes"]) {
      const globalValue = readSetting.get(key)?.value;
      if (blank(globalValue)) continue;
      for (const { id } of SPACES) {
        const spaceKey = `space_${id}_${key}`;
        if (blank(readSetting.get(spaceKey)?.value)) writeSetting.run(spaceKey, String(globalValue));
      }
    }
    writeSetting.run("per_space_rules_backfilled", "1");
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
  const SUITE_NAMES = { gallery: "Gallery", conference: "Conference Room" };
  SUITE_CODES.forEach((s, i) => {
    const name = SUITE_NAMES[s.code] || s.code;
    insertSuite.run(s.code, name, s.floor, i);
  });
  // Suite 204 was retired when the upper floor was redrawn. That area is now the
  // Conference Room (a bookable space, zone code "conference") plus the Common
  // Space label — neither is a leasable suite, so 204 stays retired.
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

/**
 * Unsaved edits from the admin Pages editor, shown ONLY in its preview frame.
 * The middleware sets `x-alley-draft` for a signed-in admin's request that
 * carries ?draft=<id> (and strips it from everyone else's), so the live site
 * never sees a draft. Outside a request (scripts, cron) there's no draft.
 */
export function draftValues() {
  let id = null;
  try {
    id = headers().get("x-alley-draft");
  } catch {
    return null;
  }
  if (!id) return null;
  const row = db.prepare("SELECT data FROM content_drafts WHERE id = ?").get(id);
  if (!row) return null;
  try {
    return JSON.parse(row.data);
  } catch {
    return null;
  }
}

export function getContent() {
  const rows = db.prepare("SELECT key, value FROM site_content").all();
  const saved = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const draft = draftValues();
  return draft ? { ...saved, ...draft } : saved;
}

export function getContentValue(key, fallback = "") {
  const draft = draftValues();
  if (draft && key in draft) return draft[key];
  const row = db.prepare("SELECT value FROM site_content WHERE key = ?").get(key);
  return row ? row.value : fallback;
}

/** Save the editor's unsaved values for the preview. Returns the draft id. */
export function saveContentDraft(id, values) {
  db.prepare("DELETE FROM content_drafts WHERE updated_at < datetime('now', '-2 days')").run();
  db.prepare(
    `INSERT INTO content_drafts (id, data, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
  ).run(id, JSON.stringify(values));
  return id;
}

export function setContent(key, value) {
  db.prepare(
    "INSERT INTO site_content (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, value ?? "");
}

export default db;

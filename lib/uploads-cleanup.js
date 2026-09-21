import fs from "node:fs";
import path from "node:path";
import { db } from "@/lib/db.js";

/**
 * Orphaned-upload sweeper.
 *
 * Replacing a photo or deleting an event unlinks the record but leaves the file
 * on the volume forever. By 2026-09-21 that had quietly grown to 79 of 159 files
 * — 203.5 MB, half the disk — holding images nothing could display, and it took
 * the site down when the volume hit 100%.
 *
 * "Referenced" is deliberately dumb and therefore robust to schema changes: scan
 * EVERY text value in EVERY table for the filename pattern `saveUpload()` mints.
 * A column added later is covered automatically; a path buried in a JSON blob
 * (directory.photos, bookings.pdf_paths) is covered too.
 *
 * Three safety rails, because this deletes real people's uploads:
 *   1. Only UUID-named files are ever considered — hand-placed or seeded files
 *      (rental-agreement.pdf, .gitkeep) can't match and are never touched.
 *   2. Files newer than the grace window are kept, so a photo uploaded through
 *      /api/upload but not yet attached to a saved record survives.
 *   3. If ANY table fails to scan, the whole sweep aborts without deleting.
 *      Partial knowledge of what's referenced is worse than no sweep at all.
 */

const UPLOAD_DIR =
  process.env.UPLOAD_DIR || path.join(process.cwd(), "public", "uploads");

// Exactly what randomUUID() + ext() produces in lib/uploads.js.
const MANAGED_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,5}$/i;
const REFERENCE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,5}/gi;

const GRACE_DAYS = Math.max(1, Number(process.env.UPLOAD_SWEEP_GRACE_DAYS) || 30);

/**
 * Every upload filename mentioned anywhere in the database.
 * Throws if a table can't be read — callers must treat that as "don't delete".
 */
export function referencedUploads() {
  const referenced = new Set();
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all();

  for (const { name } of tables) {
    const rows = db.prepare(`SELECT * FROM "${name}"`).all();
    for (const row of rows) {
      for (const value of Object.values(row)) {
        if (typeof value !== "string") continue;
        const found = value.match(REFERENCE);
        if (found) found.forEach((f) => referenced.add(f.toLowerCase()));
      }
    }
  }
  return referenced;
}

/**
 * Files on disk that nothing in the database points at and that are older than
 * the grace window. Pure inspection — deletes nothing.
 */
export function findOrphanUploads({ graceDays = GRACE_DAYS } = {}) {
  if (!fs.existsSync(UPLOAD_DIR)) return { orphans: [], scanned: 0, referenced: 0 };

  const referenced = referencedUploads();
  const cutoff = Date.now() - graceDays * 86400000;
  const orphans = [];
  let scanned = 0;

  for (const name of fs.readdirSync(UPLOAD_DIR)) {
    if (!MANAGED_FILE.test(name)) continue; // rail 1
    scanned++;
    if (referenced.has(name.toLowerCase())) continue;

    const stat = fs.statSync(path.join(UPLOAD_DIR, name));
    if (stat.mtimeMs > cutoff) continue; // rail 2 — too new to judge
    orphans.push({ name, bytes: stat.size, modified: new Date(stat.mtimeMs).toISOString() });
  }

  return { orphans, scanned, referenced: referenced.size };
}

/**
 * Delete the orphans. Returns a summary; `dryRun: true` reports without touching
 * anything. Never throws — a failed sweep must not take the daily cron down.
 */
export function sweepUploads({ graceDays = GRACE_DAYS, dryRun = false } = {}) {
  let found;
  try {
    found = findOrphanUploads({ graceDays });
  } catch (err) {
    // Rail 3: couldn't build a complete picture of what's referenced.
    console.error(`[uploads-cleanup] aborted, nothing deleted: ${err.message}`);
    return { ok: false, aborted: true, error: err.message, deleted: 0, freedBytes: 0 };
  }

  const { orphans, scanned, referenced } = found;
  let deleted = 0;
  let freedBytes = 0;

  if (!dryRun) {
    for (const orphan of orphans) {
      try {
        fs.unlinkSync(path.join(UPLOAD_DIR, orphan.name));
        deleted++;
        freedBytes += orphan.bytes;
      } catch (err) {
        console.error(`[uploads-cleanup] could not delete ${orphan.name}: ${err.message}`);
      }
    }
    if (deleted) {
      console.log(
        `[uploads-cleanup] removed ${deleted} orphaned upload(s), freed ${Math.round(freedBytes / 1048576)} MB`
      );
    }
  }

  return {
    ok: true,
    dryRun,
    scanned,
    referenced,
    orphansFound: orphans.length,
    orphanBytes: orphans.reduce((sum, o) => sum + o.bytes, 0),
    deleted,
    freedBytes,
    graceDays,
  };
}

import fs from "node:fs";
import path from "node:path";
import { getSetting, setSetting } from "@/lib/db.js";
import { sendEmail } from "@/lib/email.js";

/**
 * Volume space watch.
 *
 * SQLite writes fail outright when the disk fills — no bookings save, no admin
 * logins, no cron runs, while the public site keeps serving reads and looks
 * perfectly healthy. That is exactly how 2026-09-21 played out: the first anyone
 * knew was Chelsea being unable to log in. This mails a warning while there is
 * still room to act.
 */

const DB_PATH =
  process.env.DATABASE_PATH || path.join(process.cwd(), "data", "alley.db");
const WATCH_DIR = path.dirname(DB_PATH);

const WARN_PERCENT = Math.min(99, Math.max(1, Number(process.env.DISK_WARN_PERCENT) || 80));
const WARN_EVERY_DAYS = Math.max(1, Number(process.env.DISK_WARN_EVERY_DAYS) || 3);
const WARN_EMAIL =
  process.env.BACKUP_EMAIL || process.env.OWNER_EMAIL || "thealleyoncenter@gmail.com";

const mb = (bytes) => Math.round(bytes / 1048576);

/** Current usage of the filesystem holding the database. */
export function diskUsage(dir = WATCH_DIR) {
  const stat = fs.statfsSync(dir);
  const totalBytes = stat.blocks * stat.bsize;
  const freeBytes = stat.bavail * stat.bsize;
  const usedBytes = totalBytes - freeBytes;
  return {
    dir,
    totalBytes,
    usedBytes,
    freeBytes,
    percentUsed: totalBytes ? Math.round((usedBytes / totalBytes) * 100) : 0,
  };
}

/**
 * Warn the owner when the volume crosses WARN_PERCENT. Throttled to one mail
 * every WARN_EVERY_DAYS so a full disk doesn't become a full inbox; the throttle
 * resets once usage drops back under the threshold.
 *
 * Never throws — it runs inside the daily cron and must not break it.
 */
export async function checkDiskSpace({ force = false } = {}) {
  let usage;
  try {
    usage = diskUsage();
  } catch (err) {
    console.error(`[disk] could not read volume usage: ${err.message}`);
    return { ok: false, error: err.message };
  }

  const over = usage.percentUsed >= WARN_PERCENT;

  if (!over) {
    // Back under the line — re-arm so the next crossing warns immediately.
    if (getSetting("disk_warning_last_sent", "")) setSetting("disk_warning_last_sent", "");
    return { ...usage, threshold: WARN_PERCENT, warned: false };
  }

  const last = getSetting("disk_warning_last_sent", "");
  const daysSince = last ? (Date.now() - Date.parse(last)) / 86400000 : Infinity;
  if (!force && daysSince < WARN_EVERY_DAYS) {
    return { ...usage, threshold: WARN_PERCENT, warned: false, throttled: true };
  }

  const critical = usage.percentUsed >= 95;
  await sendEmail({
    to: WARN_EMAIL,
    subject: `${critical ? "🚨" : "⚠️"} Storage ${usage.percentUsed}% full — The Alley On Center`,
    html:
      `<p>The server's storage volume is <strong>${usage.percentUsed}% full</strong> ` +
      `(${mb(usage.usedBytes)} MB used of ${mb(usage.totalBytes)} MB, ${mb(usage.freeBytes)} MB free).</p>` +
      (critical
        ? `<p><strong>This is about to break the site.</strong> When the volume fills completely, nothing can save — ` +
          `no booking requests, no admin logins, no password resets — even though the public pages keep loading normally.</p>`
        : `<p>Nothing is broken yet. Acting now avoids an outage: when the volume fills completely, ` +
          `nothing can save — no booking requests, no admin logins, no password resets — while the public site still looks fine.</p>`) +
      `<p>What frees space, easiest first:</p><ul>` +
      `<li>Old photos from deleted or updated listings are swept automatically each night — check the daily backup email for what it removed.</li>` +
      `<li>Grow the volume in Railway: open the project, click the volume, then <strong>Live Resize</strong>. ` +
      `Storage is billed on what's actually used, so a bigger cap costs nothing until it's filled.</li>` +
      `</ul>`,
  });
  setSetting("disk_warning_last_sent", new Date().toISOString());

  console.warn(`[disk] volume ${usage.percentUsed}% full — warning emailed to ${WARN_EMAIL}`);
  return { ...usage, threshold: WARN_PERCENT, warned: true, critical };
}

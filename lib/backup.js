import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
import { execFile } from "child_process";
import { promisify } from "util";
import { db, getSetting, setSetting } from "@/lib/db.js";
import { sendEmail } from "@/lib/email.js";

const execFileP = promisify(execFile);

/**
 * Simple off-site backup of the SQLite DB + uploaded files.
 *
 * On each run it makes a *consistent* DB snapshot (SQLite online-backup API, so
 * it's safe while the app is live and WAL-aware), bundles it with the uploads
 * folder into one `.tar.gz`, keeps the last N copies on the Railway volume for
 * quick restore, and emails the archive to the owner as the off-volume copy.
 *
 * Trigger it on a schedule via GET /api/cron/backup (cron-job.org), exactly like
 * the deposit-reminders cron. The data is tiny (well under any attachment limit),
 * so emailing the whole thing is the simplest durable option — no extra accounts.
 *
 * Run it DAILY: it snapshots + keeps the last N on the volume every run, but only
 * EMAILS the archive off-site once a week (BACKUP_EMAIL_DAYS, default 7) so your
 * inbox isn't flooded. Force/suppress the email per run with runBackup({ email }).
 */

const DB_PATH =
  process.env.DATABASE_PATH || path.join(process.cwd(), "data", "alley.db");
const DATA_DIR = path.dirname(DB_PATH);
const UPLOAD_DIR =
  process.env.UPLOAD_DIR || path.join(process.cwd(), "public", "uploads");
const BACKUP_EMAIL =
  process.env.BACKUP_EMAIL || process.env.OWNER_EMAIL || "thealleyoncenter@gmail.com";
const KEEP = Math.max(1, Number(process.env.BACKUP_KEEP) || 14);
const EMAIL_EVERY_DAYS = Math.max(1, Number(process.env.BACKUP_EMAIL_DAYS) || 7);

function timestamp() {
  // 2026-06-25T14-03-22 — filesystem- and email-safe.
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

export async function runBackup({ email = "auto" } = {}) {
  const stamp = timestamp();
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "alley-backup-"));
  try {
    // 1. Consistent DB snapshot (handles WAL; safe while serving).
    const snapDb = path.join(work, "alley.db");
    await db.backup(snapDb);

    // 2. Bundle DB + uploads into one tar.gz. Fall back to a gzipped DB-only
    //    file if `tar` isn't available for any reason.
    const entries = ["alley.db"];
    let bundledUploads = false;
    if (fs.existsSync(UPLOAD_DIR) && fs.readdirSync(UPLOAD_DIR).length) {
      fs.cpSync(UPLOAD_DIR, path.join(work, "uploads"), { recursive: true });
      entries.push("uploads");
      bundledUploads = true;
    }

    let archiveName = `alley-backup-${stamp}.tar.gz`;
    let archivePath = path.join(work, archiveName);
    try {
      await execFileP("tar", ["-czf", archivePath, "-C", work, ...entries]);
    } catch {
      // No tar — gzip just the DB (still the critical, irreplaceable data).
      archiveName = `alley-db-${stamp}.db.gz`;
      archivePath = path.join(work, archiveName);
      fs.writeFileSync(archivePath, zlib.gzipSync(fs.readFileSync(snapDb)));
      bundledUploads = false;
    }

    const sizeKb = Math.max(1, Math.round(fs.statSync(archivePath).size / 1024));

    // 3. Keep the last N archives on the volume for quick restore + prune.
    const backupsDir = path.join(DATA_DIR, "backups");
    fs.mkdirSync(backupsDir, { recursive: true });
    fs.copyFileSync(archivePath, path.join(backupsDir, archiveName));
    const kept = fs
      .readdirSync(backupsDir)
      .filter((f) => /^alley-(backup|db)-.*\.(tar\.gz|db\.gz)$/.test(f))
      .sort();
    while (kept.length > KEEP) {
      fs.unlinkSync(path.join(backupsDir, kept.shift()));
    }

    // 4. Email the archive off-volume (this is what survives a lost volume) —
    //    but only weekly. The daily on-volume copies above always happen.
    let shouldEmail;
    if (email === true) shouldEmail = true;
    else if (email === false) shouldEmail = false;
    else {
      // "auto": email if it's been EMAIL_EVERY_DAYS since the last emailed copy
      // (or one was never sent). Robust to missed days / restarts.
      const last = getSetting("backup_last_emailed", "");
      const daysSince = last ? (Date.now() - Date.parse(last)) / 86400000 : Infinity;
      shouldEmail = daysSince >= EMAIL_EVERY_DAYS;
    }

    let emailMode = "skipped";
    if (shouldEmail) {
      const result = await sendEmail({
        to: BACKUP_EMAIL,
        subject: `Backup — The Alley On Center (${stamp})`,
        html:
          `<p>Automated backup of The Alley On Center.</p>` +
          `<ul>` +
          `<li>Database: included (consistent snapshot)</li>` +
          `<li>Uploaded photos/PDFs: ${bundledUploads ? "included" : "not included this run"}</li>` +
          `<li>Archive: <code>${archiveName}</code> (${sizeKb} KB)</li>` +
          `</ul>` +
          `<p>Daily snapshots are kept on the server; this email is the weekly off-site copy. ` +
          `To restore: unzip and place <code>alley.db</code> (and the <code>uploads</code> folder) ` +
          `onto the data volume. Keep this email private — it contains booking and customer data.</p>`,
        attachments: [{ filename: archiveName, path: archivePath }],
      });
      emailMode = result?.mode || "unknown";
      setSetting("backup_last_emailed", new Date().toISOString());
    }

    return {
      ok: true,
      archive: archiveName,
      sizeKb,
      bundledUploads,
      emailed: shouldEmail,
      emailedTo: shouldEmail ? BACKUP_EMAIL : null,
      emailMode,
      keptOnVolume: kept.length,
    };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

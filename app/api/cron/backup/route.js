import { NextResponse } from "next/server";
import { runBackup } from "@/lib/backup.js";
import { sweepUploads } from "@/lib/uploads-cleanup.js";
import { checkDiskSpace } from "@/lib/disk.js";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/backup — the nightly housekeeping run. Point a DAILY cron at
 * this (e.g. cron-job.org), same as /api/cron/deposit-reminders.
 *
 * Three jobs, in this order for a reason:
 *   1. Sweep orphaned uploads — frees space BEFORE anything needs to write.
 *   2. Back up the database — keeps the last few archives on the volume and
 *      emails one off-site weekly.
 *   3. Check disk usage — warns the owner while there's still room to act.
 *
 * Protect with CRON_SECRET: call with ?key=... or Authorization: Bearer <secret>.
 * Override emailing per call with ?email=1 (force send now) or ?email=0 (skip).
 * Pass ?sweep=0 to skip the sweep, or ?sweep=dry to report orphans without
 * deleting them.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided =
      searchParams.get("key") ||
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  const e = searchParams.get("email");
  const email =
    e === "1" || e === "true" || e === "force" ? true
    : e === "0" || e === "false" ? false
    : "auto";

  const s = searchParams.get("sweep");
  const sweepMode = s === "0" || s === "false" ? "off" : s === "dry" ? "dry" : "on";

  try {
    // 1. Reclaim space first — a full volume would fail the backup copy below.
    const cleanup =
      sweepMode === "off" ? null : sweepUploads({ dryRun: sweepMode === "dry" });

    // 2. Snapshot the database.
    const result = await runBackup({ email, cleanup });

    // 3. Report on what's left. Its own throttled email; failures don't matter here.
    const disk = await checkDiskSpace();

    return NextResponse.json({ ...result, cleanup, disk });
  } catch (err) {
    console.error("[cron/backup] failed:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { runBackup } from "@/lib/backup.js";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/backup
 * Makes a consistent DB snapshot + uploads archive and keeps the last few on the
 * volume on EVERY run; emails the archive off-site only weekly. Point a DAILY
 * cron at this (e.g. cron-job.org), same as /api/cron/deposit-reminders.
 *
 * Protect with CRON_SECRET: call with ?key=... or Authorization: Bearer <secret>.
 * Override emailing per call with ?email=1 (force send now) or ?email=0 (skip).
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
  try {
    const result = await runBackup({ email });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[cron/backup] failed:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

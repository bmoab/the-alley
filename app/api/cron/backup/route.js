import { NextResponse } from "next/server";
import { runBackup } from "@/lib/backup.js";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/backup
 * Makes a consistent DB snapshot + uploads archive, keeps the last few on the
 * volume, and emails the archive off-site. Point a daily cron at this (e.g.
 * cron-job.org), same as /api/cron/deposit-reminders.
 *
 * Protect with CRON_SECRET: call with ?key=... or Authorization: Bearer <secret>.
 */
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const { searchParams } = new URL(request.url);
    const provided =
      searchParams.get("key") ||
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  try {
    const result = await runBackup();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[cron/backup] failed:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

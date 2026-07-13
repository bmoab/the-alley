import { NextResponse } from "next/server";
import { runPendingRequestReminder } from "@/lib/bookings.js";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/pending-reminders
 * On business days (Mon–Fri), emails the owner a nudge if any booking requests
 * are still unapproved. Idempotent — sends at most once per calendar day, so
 * it's safe to call repeatedly. Point a daily cron at this (e.g. cron-job.org),
 * same as the other jobs — e.g. 15:00 UTC (~9am Denver).
 *
 * Optionally protect with CRON_SECRET: call with ?key=... or
 * Authorization: Bearer <CRON_SECRET>. Add ?force=1 to bypass the weekend +
 * once-a-day guards for a manual test send.
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
  const force = searchParams.get("force") === "1";
  const result = await runPendingRequestReminder({ force });
  return NextResponse.json({ ok: true, ...result });
}

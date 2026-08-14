import { NextResponse } from "next/server";
import { runUpcomingEventReminders } from "@/lib/event-reminders.js";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/event-reminders
 * Emails the "happening soon" digests — everything booked in the building a
 * couple of days out, and again on the morning of. Includes PRIVATE bookings,
 * which never appear on the public calendar. Both windows go out from this one
 * call, so a single daily job covers it (e.g. ~9 AM America/Denver, like the
 * other jobs). Idempotent; safe to call repeatedly.
 *
 * ?force=1 bypasses the once-a-day guard (but not the "nothing on that day"
 * skip) so this can be exercised in production without waiting for tomorrow.
 *
 * Optionally protect with CRON_SECRET: ?key=... or Authorization: Bearer <...>.
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
  const result = await runUpcomingEventReminders({ force });
  return NextResponse.json({ ok: true, ...result });
}

import { NextResponse } from "next/server";
import { runHostDetailReminders } from "@/lib/host-reminders.js";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/host-reminders
 * Nudges each host whose event is on the public calendar as a placeholder but
 * who hasn't added their details yet — at most once every ~3 days per listing,
 * until they post or the event is nearly here. Idempotent; safe to call
 * repeatedly. Point a daily cron at this (e.g. ~9 AM America/Denver, like the
 * other jobs); the every-3-days pacing is handled in the query.
 *
 * Optionally protect with CRON_SECRET: ?key=... or Authorization: Bearer <...>.
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
  const sent = await runHostDetailReminders();
  return NextResponse.json({ ok: true, remindersSent: sent });
}

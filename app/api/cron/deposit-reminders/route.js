import { NextResponse } from "next/server";
import { runDepositReminders } from "@/lib/deposits.js";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/deposit-reminders
 * Sends due deposit-refund reminder emails (days 1–3 after an event).
 * Idempotent — safe to call repeatedly. Point a daily 11 AM cron at this
 * (e.g. a system crontab, Railway/Render scheduled job, or Vercel Cron).
 *
 * Optionally protect with CRON_SECRET: call with ?key=... or
 * Authorization: Bearer <CRON_SECRET>.
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
  const sent = await runDepositReminders();
  return NextResponse.json({ ok: true, remindersSent: sent });
}

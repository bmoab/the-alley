import { NextResponse } from "next/server";
import { runPaymentReminders } from "@/lib/payments.js";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/payment-reminders
 * Emails a payment reminder to each client whose approved booking is still
 * unpaid and inside its hold window — at most once per day per booking, until
 * they pay or the hold expires. Idempotent; safe to call repeatedly. Point a
 * daily cron at this (e.g. ~9 AM America/Denver, like the other jobs).
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
  const sent = await runPaymentReminders();
  return NextResponse.json({ ok: true, remindersSent: sent });
}

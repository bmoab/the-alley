import { NextResponse } from "next/server";
import { runSeriesInvoices } from "@/lib/series.js";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/series-invoices
 * Sends rental invoices for recurring-series sessions coming up within the
 * configured lead window (series_invoice_lead_days). The first session is
 * invoiced at approval, so the cron only covers sessions 2..N. Idempotent.
 * Point a daily cron at this (cron-job.org / Railway), like deposit-reminders.
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
  const sent = await runSeriesInvoices();
  return NextResponse.json({ ok: true, invoicesSent: sent });
}

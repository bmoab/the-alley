import { NextResponse } from "next/server";
import { syncSquareSales } from "@/lib/inventory.js";
import { staffCostDaily, monthLabel } from "@/lib/staff-costs.js";
import { emailStaffCostReady } from "@/lib/email.js";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/square-sales
 * Copies the day's completed Square register sales into the site (for
 * consignor payouts and the sales-tax report) and refreshes every item's
 * on-hand count — and, from the 1st of each month, builds last month's shared
 * staff cost and tells the bookkeeper it's ready to send. Re-reads a small overlap each run and ignores duplicates, so
 * it's safe to call as often as you like. Point a nightly cron at this, e.g.
 * ~2 AM America/Denver (`0 8 * * *` UTC).
 *
 * Protected by CRON_SECRET (?key=... or Authorization: Bearer <...>) — and
 * refused outright in production if that isn't set, since it calls Square.
 */
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "CRON_SECRET isn't set" }, { status: 503 });
  }
  if (secret) {
    const { searchParams } = new URL(request.url);
    const provided =
      searchParams.get("key") ||
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  let sales;
  try {
    sales = await syncSquareSales();
  } catch (err) {
    console.error("[cron] square-sales failed", err);
    sales = { error: "Sync failed — see the server log." };
  }
  // Separate, so a hiccup in one never skips the other.
  let staffCosts;
  try {
    staffCosts = await staffCostDaily({
      notify: (m) => emailStaffCostReady(m, { label: monthLabel(m.month), warnings: m.detail?.warnings || [] }),
    });
  } catch (err) {
    console.error("[cron] staff-costs failed", err);
    staffCosts = { error: "Staff cost step failed — see the server log." };
  }
  const ok = !sales.error && !staffCosts.error;
  return NextResponse.json({ ok, ...sales, staffCosts }, { status: ok ? 200 : 500 });
}

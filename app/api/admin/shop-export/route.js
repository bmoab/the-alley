import { getCurrentUser } from "@/lib/auth.js";
import { listSales, consignorShare, listPayouts } from "@/lib/inventory.js";

export const dynamic = "force-dynamic";

function csv(rows, columns) {
  const esc = (v) => {
    let s = v == null ? "" : String(v);
    // Text a maker typed could start with "=" and run as a formula in Excel —
    // a leading apostrophe makes the spreadsheet show it as plain text.
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map(([h]) => esc(h)).join(","), ...rows.map((r) => columns.map(([, k]) => esc(typeof k === "function" ? k(r) : r[k])).join(","))].join("\r\n");
}

/**
 * GET /api/admin/shop-export?year=2026&what=sales|payouts
 * A year's register sales or maker payouts as CSV, for an accountant or a
 * spreadsheet. Any admin, like the Sales page.
 */
export async function GET(request) {
  // Same people as the Sales page it's linked from (any admin; never staff).
  const me = await getCurrentUser();
  if (!me) return new Response("Not allowed", { status: 403 });
  const { searchParams } = new URL(request.url);
  const year = Number(searchParams.get("year")) || new Date().getFullYear();
  const what = searchParams.get("what") === "payouts" ? "payouts" : "sales";
  const body =
    what === "sales"
      ? csv(listSales({ from: `${year}-01-01`, to: `${year}-12-31` }).reverse(), [
          ["Sold at", "sold_at"],
          ["Square order", "square_order_id"],
          ["Kind", "kind"],
          ["Item", "name"],
          ["Maker", "vendor_name"],
          ["Consigned", (r) => (r.ownership === "consignment" ? "yes" : "")],
          ["Qty", "qty"],
          ["Gross", "gross"],
          ["Discount", "discount"],
          ["Net", "net"],
          ["Tax", "tax"],
          ["Total", "total"],
          ["Maker's share", (r) => consignorShare(r)],
        ])
      : csv(listPayouts({ from: `${year}-01-01`, to: `${year}-12-31` }), [
          ["Paid on", "paid_on"],
          ["Maker", "vendor_name"],
          ["Amount", "amount"],
          ["Sales covered", "sales_total"],
          ["Through", "through"],
          ["Method", "method"],
          ["Reference", "reference"],
        ]);
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="alley-${what}-${year}.csv"`,
    },
  });
}

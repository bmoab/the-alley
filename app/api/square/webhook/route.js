import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getBookingByInvoice, getBookingByDepositInvoice, markDepositPaid } from "@/lib/bookings.js";
import { getInvoiceStatus } from "@/lib/square.js";
import { confirmBookingPaid } from "@/lib/payments.js";

export const dynamic = "force-dynamic";

/**
 * Square webhook → auto-confirm a booking when its invoice is paid.
 *
 * Setup (Square Developer Dashboard → your app → Sandbox → Webhooks):
 *   - Add endpoint: https://<your-app>/api/square/webhook
 *   - Subscribe to: invoice.payment_made (and optionally invoice.updated)
 *   - Copy the Signature Key → set SQUARE_WEBHOOK_SIGNATURE_KEY on the host.
 *   - Set SQUARE_WEBHOOK_URL to the exact endpoint URL you entered (defaults to
 *     APP_URL + /api/square/webhook).
 *
 * Signature: base64(HMAC-SHA256(key = signature key, msg = notificationUrl + rawBody)).
 */
function verify(rawBody, signature) {
  const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  if (!key) return { ok: false, reason: "no signature key configured" };
  if (!signature) return { ok: false, reason: "missing signature header" };
  const url =
    process.env.SQUARE_WEBHOOK_URL ||
    `${process.env.APP_URL || ""}/api/square/webhook`;
  const expected = crypto.createHmac("sha256", key).update(url + rawBody).digest("base64");
  // Constant-time compare.
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  return { ok, reason: ok ? "" : "signature mismatch" };
}

export async function POST(request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-square-hmacsha256-signature");

  const { ok, reason } = verify(rawBody, signature);
  if (!ok) {
    console.warn("[square:webhook] rejected:", reason);
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  }

  try {
    // Invoice events carry the invoice id at data.id (data.type === "invoice").
    const data = event?.data || {};
    const invoiceId =
      data?.object?.invoice?.id || (data?.type === "invoice" ? data?.id : null);

    if (invoiceId) {
      const booking = getBookingByInvoice(invoiceId);
      if (booking && booking.payment_status !== "paid") {
        const status = await getInvoiceStatus(invoiceId);
        if (status === "paid") {
          await confirmBookingPaid(booking.id);
          console.log(`[square:webhook] confirmed booking #${booking.id} from ${event.type}`);
        }
      } else if (!booking) {
        // Maybe it's a recurring series' standalone deposit invoice.
        const holder = getBookingByDepositInvoice(invoiceId);
        if (holder && holder.deposit_payment_status !== "paid") {
          const status = await getInvoiceStatus(invoiceId);
          if (status === "paid") {
            markDepositPaid(holder.id);
            console.log(`[square:webhook] series #${holder.series_id} deposit paid (holder #${holder.id})`);
          }
        }
      }
    }
  } catch (err) {
    console.error("[square:webhook] handler error:", err.message);
    // Still 200 so Square doesn't hammer retries on a transient app error.
  }

  return NextResponse.json({ received: true });
}

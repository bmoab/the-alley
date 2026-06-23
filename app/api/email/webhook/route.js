import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { updateDeliveryStatusByProviderId } from "@/lib/activity.js";

export const dynamic = "force-dynamic";

/**
 * Email delivery webhook (Resend). Upgrades an activity entry's delivery_status
 * from "sent" to delivered/bounced/failed using the provider message id we
 * stored when the email was sent. We do NOT track opens.
 *
 * Setup (Resend → Webhooks): add this endpoint, subscribe to email.delivered /
 * email.bounced / email.complained, and set RESEND_WEBHOOK_SECRET (the signing
 * secret, "whsec_…") so signatures are verified. With no secret configured the
 * endpoint accepts unsigned posts (dev only).
 */
const STATUS_MAP = {
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.complained": "bounced",
  "email.failed": "failed",
  "email.delivery_delayed": "sent",
  "email.sent": "sent",
};

// Svix signature verification (Resend uses Svix).
function verifySvix(secret, headers, body) {
  const id = headers.get("svix-id");
  const ts = headers.get("svix-timestamp");
  const sigHeader = headers.get("svix-signature");
  if (!id || !ts || !sigHeader) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signed = `${id}.${ts}.${body}`;
  const expected = crypto.createHmac("sha256", key).update(signed).digest("base64");
  const exp = Buffer.from(expected);
  return sigHeader.split(" ").some((part) => {
    const sig = part.split(",")[1];
    if (!sig) return false;
    const got = Buffer.from(sig);
    return got.length === exp.length && crypto.timingSafeEqual(got, exp);
  });
}

export async function POST(request) {
  const body = await request.text();
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (secret && !verifySvix(secret, request.headers, body)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let event;
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  }

  const status = STATUS_MAP[event?.type];
  const emailId = event?.data?.email_id || event?.data?.id;
  if (status && emailId) {
    const n = updateDeliveryStatusByProviderId(emailId, status);
    console.log(`[email:webhook] ${event.type} → ${emailId} (${n} updated)`);
  }
  return NextResponse.json({ received: true });
}

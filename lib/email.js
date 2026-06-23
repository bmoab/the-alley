import fs from "node:fs";
import path from "node:path";
import {
  spaceName,
  formatDate,
  formatTime,
  formatMoney,
} from "./constants.js";
import { getContentValue } from "./db.js";

/** Optional "add our shared calendar" line for invite emails. */
function calendarShareHtml() {
  const url = getContentValue("calendar_share_url", "");
  if (!url) return "";
  return `<p style="font-size:13px;color:#5b5147">Want our shared events calendar? <a href="${url}">Add it here</a> to see everything happening at The Alley.</p>`;
}

/**
 * Email delivery with a graceful fallback chain:
 *   1. Resend       (if RESEND_API_KEY)         — via fetch, no SDK
 *   2. SMTP/Gmail   (if SMTP_HOST + SMTP_USER)  — via nodemailer
 *   3. Console log  (otherwise)                 — so the demo always "sends"
 *
 * Every template is warm and on-brand, signed off as The Alley On Center.
 */

const FROM = process.env.EMAIL_FROM || "The Alley On Center <thealleyoncenter@gmail.com>";
const OWNER = process.env.OWNER_EMAIL || "thealleyoncenter@gmail.com";
const APP_URL = process.env.APP_URL || "http://localhost:3000";

function deliveryMode() {
  if (process.env.RESEND_API_KEY) return "resend";
  if (process.env.SMTP_HOST && process.env.SMTP_USER) return "smtp";
  return "console";
}

/**
 * Send an email. `attachments` is an array of { filename, path } (local files).
 * Returns { mode, ok, id } — `id` is the provider's message id when available
 * (used to reconcile delivery-status webhooks); null otherwise.
 */
export async function sendEmail({ to, subject, html, text, attachments = [] }) {
  const mode = deliveryMode();
  const body = text || stripHtml(html);

  if (mode === "console") {
    console.log(
      `\n══════════ ✉️  EMAIL (console fallback) ══════════\n` +
        `To:      ${to}\n` +
        `From:    ${FROM}\n` +
        `Subject: ${subject}\n` +
        (attachments.length
          ? `Attach:  ${attachments.map((a) => a.filename).join(", ")}\n`
          : "") +
        `------------------------------------------------\n` +
        `${body}\n` +
        `════════════════════════════════════════════════\n`
    );
    return { mode, ok: true, id: null };
  }

  try {
    if (mode === "resend") {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: FROM,
          to: [to],
          subject,
          html,
          attachments: attachments.map((a) => ({
            filename: a.filename,
            content: fs.readFileSync(a.path).toString("base64"),
          })),
        }),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
      const json = await res.json().catch(() => ({}));
      return { mode, ok: true, id: json?.id || null };
    }

    if (mode === "smtp") {
      const nodemailer = (await import("nodemailer")).default;
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      const info = await transport.sendMail({ from: FROM, to, subject, html, text: body, attachments });
      return { mode, ok: true, id: info?.messageId || null };
    }
  } catch (err) {
    console.error(`[email] ${mode} send failed, logging instead:`, err.message);
    console.log(`\n✉️  (failed ${mode}) To: ${to} · ${subject}\n${body}\n`);
    return { mode: "console", ok: false, id: null };
  }
}

function stripHtml(html = "") {
  return html
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------------------------------------------------------------------------
// Brand shell + signature
// ---------------------------------------------------------------------------

const SIGNATURE = `
  <p style="margin-top:28px;color:#5b5147;font-size:14px;line-height:1.6">
    Warmly,<br/>
    <strong style="color:#1c1815">The Alley On Center</strong><br/>
    <a href="mailto:thealleyoncenter@gmail.com" style="color:#8a6726">thealleyoncenter@gmail.com</a> · (435) 512-4608<br/>
    Logan, Utah
  </p>`;

function shell(innerHtml) {
  return `<div style="background:#f7f1e6;padding:32px 0;font-family:Archivo,Helvetica,Arial,sans-serif">
    <div style="max-width:560px;margin:0 auto;background:#fffdf8;border:1px solid #1c181510;border-radius:16px;padding:32px 36px">
      <div style="font-family:Georgia,serif;font-size:20px;font-weight:600;color:#1c1815;border-bottom:1px solid #1c181510;padding-bottom:16px;margin-bottom:24px">
        The Alley <span style="color:#b08433">On Center</span>
      </div>
      <div style="color:#2c2620;font-size:15px;line-height:1.65">${innerHtml}</div>
      ${SIGNATURE}
    </div>
  </div>`;
}

function bookingSummaryHtml(b) {
  return `<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
    ${[
      ["Space", spaceName(b.space)],
      ["Date", formatDate(b.date)],
      ["Time", `${formatTime(b.start_time)} · ${b.hours} hours`],
      ["Total", formatMoney(b.total)],
    ]
      .map(
        ([k, v]) =>
          `<tr><td style="padding:6px 0;color:#5b5147">${k}</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#1c1815">${v}</td></tr>`
      )
      .join("")}
  </table>`;
}

const RENTAL_AGREEMENT_PATH = path.join(process.cwd(), "public", "rental-agreement.pdf");
function rentalAgreementAttachment() {
  if (fs.existsSync(RENTAL_AGREEMENT_PATH)) {
    return [{ filename: "Event Rental Agreement.pdf", path: RENTAL_AGREEMENT_PATH }];
  }
  return [];
}

// ---------------------------------------------------------------------------
// The 8 templates (section 9). Each returns a sendEmail() promise.
// ---------------------------------------------------------------------------

// 1 — Owner: new booking request
export function emailOwnerNewRequest(b) {
  const html = shell(`
    <p>You have a new booking request.</p>
    <p><strong>${b.client_name}</strong> would like to reserve a space.</p>
    ${bookingSummaryHtml(b)}
    <p style="font-size:14px;color:#5b5147">
      ${b.event_type || "Event"} · ${b.guests || "guests TBD"} ·
      Alcohol: ${b.alcohol ? "Yes" : "No"}${b.is_recurring ? ` · Recurring: ${b.recurring_schedule || "yes"}` : ""}
      ${b.is_public_event ? " · Wants a public calendar listing" : ""}
    </p>
    ${b.notes ? `<p style="background:#efe6d6;padding:12px 14px;border-radius:8px;font-size:14px"><em>"${b.notes}"</em></p>` : ""}
    <p><a href="${APP_URL}/admin/requests" style="display:inline-block;background:#1c1815;color:#f7f1e6;text-decoration:none;padding:10px 20px;border-radius:999px;font-weight:600;font-size:14px">Review in admin →</a></p>
  `);
  return sendEmail({ to: OWNER, subject: `New booking request — ${b.client_name}`, html });
}

// 2 — Client: request received
export function emailClientReceived(b) {
  const html = shell(`
    <p>Hi ${firstName(b.client_name)},</p>
    <p>Thank you for your request to gather with us at The Alley. We&rsquo;ve received it and <strong>no charge has been made</strong>.</p>
    ${bookingSummaryHtml(b)}
    <p>We&rsquo;ll review your request and get back to you within 24 hours. If it&rsquo;s approved, we&rsquo;ll send a secure payment link to confirm your date.</p>
  `);
  return sendEmail({ to: b.client_email, subject: "We received your request — The Alley On Center", html });
}

// 3 — Client: approved + payment link (rental agreement attached)
export function emailClientApproved(b) {
  const days = process.env.PAYMENT_WINDOW_DAYS || 3;
  const html = shell(`
    <p>Hi ${firstName(b.client_name)},</p>
    <p>Wonderful news — your booking is <strong>approved</strong>! Here are the details:</p>
    ${bookingSummaryHtml(b)}
    <p>To lock in your date, please complete payment using the secure link below.
       Your date is held for <strong>3 days</strong>; if payment isn&rsquo;t received by then, the hold is released.</p>
    ${b.payment_link ? `<p><a href="${b.payment_link}" style="display:inline-block;background:#b08433;color:#fff;text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:600;font-size:15px">Pay &amp; confirm your booking →</a></p>` : ""}
    <p style="font-size:13px;color:#5b5147">A copy of our rental agreement is attached for your records.</p>
  `);
  return sendEmail({
    to: b.client_email,
    subject: "Your booking is approved — payment link inside",
    html,
    attachments: rentalAgreementAttachment(),
  });
}

// 4 — Client: booking confirmed (after payment)
export function emailClientConfirmed(b) {
  const html = shell(`
    <p>Hi ${firstName(b.client_name)},</p>
    <p>Your payment came through and your booking is <strong>confirmed</strong>. We can&rsquo;t wait to host you.</p>
    ${bookingSummaryHtml(b)}
    <p>The $${Number(b.deposit).toFixed(0)} cleaning deposit is refundable within 3 business days after your event, subject to inspection.</p>
    ${b.is_public_event ? `<p>Since you&rsquo;d like your event on our public calendar, watch for a separate email with a private link to post your listing.</p>` : ""}
    <p style="font-size:13px;color:#5b5147">Need to cancel or change your booking? Please contact Chelsea at <a href="mailto:thealleyoncenter@gmail.com">thealleyoncenter@gmail.com</a> or (435) 512-4608. Cancellation and refund terms are detailed in your rental agreement.</p>
  `);
  return sendEmail({ to: b.client_email, subject: "You're booked! — The Alley On Center", html });
}

// 4b — Client: booking cancelled (owner-initiated) + refund summary
export function emailClientCancelled(b) {
  const refund = Number(b.refund_amount) || 0;
  const type = b.refund_type || "none";
  let refundLine;
  if (type === "full") {
    refundLine = `<p>A full refund of <strong>${formatMoney(refund)}</strong> (your rental and the ${formatMoney(b.deposit)} cleaning deposit) has been issued to your original payment method. Please allow a few business days for it to appear.</p>`;
  } else if (type === "deposit_only") {
    refundLine = `<p>Per our cancellation policy (cancellations made within the cutoff before the event), the rental fee is forfeited and your <strong>${formatMoney(refund)}</strong> cleaning deposit has been refunded to your original payment method. Please allow a few business days for it to appear.</p>`;
  } else {
    refundLine = `<p>No payment had been collected for this reservation, so there is nothing to refund.</p>`;
  }
  const html = shell(`
    <p>Hi ${firstName(b.client_name)},</p>
    <p>This confirms your reservation at The Alley On Center has been <strong>cancelled</strong>.</p>
    ${bookingSummaryHtml(b)}
    ${refundLine}
    <p style="font-size:13px;color:#5b5147">Questions, or want to rebook another date? Just reply to this email or call Chelsea at (435) 512-4608 — we&rsquo;d love to host you another time.</p>
  `);
  return sendEmail({ to: b.client_email, subject: "Your reservation has been cancelled — The Alley On Center", html });
}

// 5 — Client: request denied. `clientPhrasing` is the gracious, reason-driven
// line (see lib/denial.js). The internal reason is NEVER passed here — the
// client message stays warm and brief regardless of the candid internal note.
export function emailClientDenied(b, clientPhrasing) {
  const reasonLine =
    clientPhrasing ||
    "Unfortunately, we&rsquo;re unable to accommodate this particular request at this time.";
  const html = shell(`
    <p>Hi ${firstName(b.client_name)},</p>
    <p>Thank you for thinking of The Alley for your ${b.event_type ? b.event_type.toLowerCase() : "event"}${b.date ? ` on ${formatDate(b.date)}` : ""}.</p>
    <p>${reasonLine}</p>
    <p>We&rsquo;d genuinely love to host you another time — please don&rsquo;t hesitate to reach out about other dates.</p>
  `);
  return sendEmail({ to: b.client_email, subject: "About your booking request — The Alley On Center", html });
}

// 6 — Client: hold expired
export function emailClientHoldExpired(b) {
  const html = shell(`
    <p>Hi ${firstName(b.client_name)},</p>
    <p>We held ${spaceName(b.space)} on ${formatDate(b.date)} for you, but we didn&rsquo;t receive payment within the 3-day window, so the hold has been released.</p>
    <p>If you&rsquo;re still interested, we&rsquo;d be happy to set it up again — just submit a new request and we&rsquo;ll get you sorted.</p>
    <p><a href="${APP_URL}/book" style="display:inline-block;background:#1c1815;color:#f7f1e6;text-decoration:none;padding:10px 20px;border-radius:999px;font-weight:600;font-size:14px">Request again →</a></p>
  `);
  return sendEmail({ to: b.client_email, subject: "Your hold has expired — The Alley On Center", html });
}

// 7 — Host: event listing invite
export function emailHostInvite(b, token) {
  const link = `${APP_URL}/host-listing/${token}`;
  const html = shell(`
    <p>Hi ${firstName(b.client_name)},</p>
    <p>Your booking is confirmed and you told us you&rsquo;d like your class/event listed on The Alley&rsquo;s public calendar — fantastic!</p>
    <p>Use your private link below to post your listing: add a description, photo or flyer, the number of spots, and how attendees should pay you (Venmo, Cash App, pay-at-door — your call). The Alley takes no payment; this is simply free advertising for your event.</p>
    <p><a href="${link}" style="display:inline-block;background:#b08433;color:#fff;text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:600;font-size:15px">Post your event →</a></p>
    <p style="font-size:13px;color:#5b5147">This link is unique to you — no account needed. Your submission goes to us for a quick review before it goes live.</p>
    ${calendarShareHtml()}
  `);
  return sendEmail({ to: b.client_email, subject: "Post your event on The Alley's calendar", html });
}

// 9 — Tenant: directory self-edit invite
export function emailTenantInvite(entry, token) {
  const link = `${APP_URL}/business-listing/${token}`;
  const html = shell(`
    <p>Hi ${firstName(entry.business_name)},</p>
    <p>Welcome to The Alley! You now have a spot in our public business directory, and you control it.</p>
    <p>Use your private link below to set up your listing: add your description, a photo, your category, and a link to your website or social. No account needed — the link is unique to you and you can come back and edit anytime.</p>
    <p><a href="${link}" style="display:inline-block;background:#b08433;color:#fff;text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:600;font-size:15px">Set up your listing →</a></p>
    <p style="font-size:13px;color:#5b5147">Your changes go live on our directory right away.</p>
    ${calendarShareHtml()}
  `);
  return sendEmail({
    to: entry.contact_email,
    subject: "Set up your business listing — The Alley On Center",
    html,
  });
}

// 9b — Exhibitor: gallery self-edit invite
export function emailExhibitorInvite(ex, token) {
  const link = `${APP_URL}/exhibitor/${token}`;
  const html = shell(`
    <p>Hi ${firstName(ex.name)},</p>
    <p>We&rsquo;d love to feature your work in The Alley gallery. You now have your own page on our public Exhibitors listing — and you control it.</p>
    <p>Use your private link below to set it up: add your bio, your discipline, a profile photo, and photos of your work. No account needed — the link is unique to you and you can come back and edit anytime.</p>
    <p><a href="${link}" style="display:inline-block;background:#b08433;color:#fff;text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:600;font-size:15px">Set up your exhibitor page →</a></p>
    <p style="font-size:13px;color:#5b5147">Your changes go live on our Exhibitors page right away.</p>
    ${calendarShareHtml()}
  `);
  return sendEmail({
    to: ex.contact_email,
    subject: "Set up your exhibitor page — The Alley On Center",
    html,
  });
}

// 10 — Admin: password reset link (forgot-password flow)
export function emailPasswordReset(user, link) {
  const html = shell(`
    <p>Hi ${firstName(user.name || user.email)},</p>
    <p>We received a request to reset your password for The Alley admin. Click below to choose a new one — the link is good for one hour.</p>
    <p><a href="${link}" style="display:inline-block;background:#1c1815;color:#f7f1e6;text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:600;font-size:15px">Reset your password →</a></p>
    <p style="font-size:13px;color:#5b5147">If you didn&rsquo;t request this, you can safely ignore this email — your password won&rsquo;t change.</p>
  `);
  return sendEmail({ to: user.email, subject: "Reset your Alley admin password", html });
}

// 8 — Owner: deposit refund reminder (day 1/2/3)
export function emailOwnerDepositReminder(b, dayNumber) {
  const html = shell(`
    <p>Reminder (day ${dayNumber} of 3): a cleaning deposit is awaiting your decision.</p>
    ${bookingSummaryHtml(b)}
    <p><strong>${b.client_name}</strong>&rsquo;s event has passed. Please inspect the space, then refund or withhold the
       $${Number(b.deposit).toFixed(0)} deposit.</p>
    <p><a href="${APP_URL}/admin/deposits" style="display:inline-block;background:#1c1815;color:#f7f1e6;text-decoration:none;padding:10px 20px;border-radius:999px;font-weight:600;font-size:14px">Resolve deposit →</a></p>
  `);
  return sendEmail({ to: OWNER, subject: `Deposit reminder (day ${dayNumber}) — ${b.client_name}`, html });
}

function firstName(name = "") {
  return name.trim().split(/\s+/)[0] || "there";
}

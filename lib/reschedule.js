/**
 * Moving a booking to another day.
 *
 * Chelsea's rule: a client may move their own booking while it's still at least
 * `reschedule_notice_days` (14) out; closer than that it needs a person. The
 * owner can override that window — the warning is advisory for admin, a hard
 * gate for the client link.
 *
 * A move keeps the same space, duration and price, which is what makes this
 * cheap: Square invoices carry no event date (only a due date), so nothing has
 * to be voided or reissued and a paid booking stays paid.
 *
 * This module is the async orchestrator — validation lives in lib/bookings.js
 * and the listing sync in lib/catalog.js, so neither of those has to import
 * email/activity and risk an import cycle.
 */

import {
  getBooking,
  canReschedule,
  applyBookingMove,
  ensureRescheduleToken,
} from "./bookings.js";
import { syncEventForBooking } from "./catalog.js";
import { spaceRules } from "./spaces.js";
import { reissueInvoice } from "./payments.js";
import { chargeBooking, refundAcrossInvoices, recordRefund } from "./booking-charges.js";
import { emailClientRescheduled, emailOwnerBookingRescheduled } from "./email.js";
import { requestRecipients, recipientLabel } from "./notify.js";
import { logActivity, logEmail } from "./activity.js";
import { formatDateShort, formatTime, formatMoney, spaceName } from "./constants.js";

const SYSTEM_ACTOR = { actorUserId: null, actorName: "system" };

const HHMM = /^([01]\d|2[0-3]):(00|30)$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Human-readable reason for each failure code, for the client/admin surfaces. */
export function rescheduleErrorMessage(code, { conflict = null, noticeDays = 14 } = {}) {
  switch (code) {
    case "not_found":
      return "We couldn't find that booking.";
    case "archived":
      return "This booking is archived.";
    case "bad_status":
      return "This booking can't be moved.";
    case "past":
      return "This booking has already happened.";
    case "too_close":
      return `Changes need at least ${noticeDays} days' notice.`;
    case "too_many_moves":
      return "This booking has already been moved a couple of times — let's sort the next change together.";
    case "bad_date":
      return "Please choose a date.";
    case "bad_time":
      return "Please choose a start time.";
    case "too_soon":
      return "That start time has already passed — please pick a later one.";
    case "closed":
      return "The Alley is closed then — please pick another time or date.";
    case "outside_hours":
      return "That would run outside our opening hours — please pick another time.";
    case "taken":
      return conflict
        ? `That slot is already taken (${conflict.client_name}, ${formatTime(conflict.start_time)}). Please pick another.`
        : "That slot is already taken — please pick another.";
    case "needs_override":
      return "This is inside the notice window — tick the box to move it anyway.";
    case "bad_length":
      return "Please choose how long it runs.";
    case "series_length":
      return "A recurring session's length can't be changed here yet — only its date and start time.";
    default:
      return "That change couldn't be made.";
  }
}

const hrs = (h) => `${Number(h)} ${Number(h) === 1 ? "hour" : "hours"}`;
/** "1:00 PM–4:00 PM" from a start and a length. */
function span(start, hours) {
  const [h, m] = String(start).split(":").map(Number);
  const t = (h * 60 + (m || 0) + Math.round(Number(hours) * 60)) % 1440;
  return `${formatTime(start)}–${formatTime(`${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`)}`;
}

/**
 * Move a booking, and (admin only) change how long it runs. Returns:
 *   { ok: true, booking, before, warnings }   — moved
 *   { ok: true, noop: true }                  — same date and time; nothing done
 *   { ok: false, code, error, conflict? }     — rejected
 *
 * `source: "client"` enforces the notice window and the move cap; "admin"
 * requires `override` when the booking is inside the window.
 */
export async function applyReschedule(
  id,
  { date, start_time, hours = null },
  { actor = SYSTEM_ACTOR, source = "admin", override = false, notify = true, refund = true } = {}
) {
  const booking = getBooking(id);
  const gate = canReschedule(booking, { source });
  if (!gate.ok) {
    return { ok: false, code: gate.code, error: gate.error, warnings: gate.warnings };
  }

  const toDate = String(date || "").trim();
  const toStart = String(start_time || booking.start_time || "").trim();
  if (!YMD.test(toDate)) return { ok: false, code: "bad_date", error: rescheduleErrorMessage("bad_date") };
  // Both pickers emit :00/:30 only, and every availability routine steps by 0.5.
  if (!HHMM.test(toStart)) return { ok: false, code: "bad_time", error: rescheduleErrorMessage("bad_time") };

  // A new length is the owner's call only; clients move days, not hours.
  let toHours = null;
  if (hours != null && hours !== "" && source === "admin") {
    toHours = Number(hours);
    const { minHours, maxHours } = spaceRules(booking.space);
    if (!Number.isFinite(toHours) || toHours <= 0 || toHours * 2 !== Math.round(toHours * 2) || toHours > Math.max(maxHours, 24)) {
      return { ok: false, code: "bad_length", error: rescheduleErrorMessage("bad_length") };
    }
    if (toHours === Number(booking.hours)) toHours = null;
    else if (booking.series_id) return { ok: false, code: "series_length", error: rescheduleErrorMessage("series_length") };
    void minHours; // the owner may go under the public minimum on purpose
  }

  if (toDate === booking.date && toStart === booking.start_time && toHours == null) {
    return { ok: true, noop: true, booking };
  }

  // Inside the notice window an admin has to say so explicitly.
  if (gate.warnings.includes("too_close") && !override) {
    return {
      ok: false,
      code: "needs_override",
      error: rescheduleErrorMessage("needs_override"),
      warnings: gate.warnings,
      noticeDays: gate.noticeDays,
      daysOut: gate.daysOut,
    };
  }

  const moved = applyBookingMove(id, { date: toDate, start_time: toStart, hours: toHours });
  if (!moved.ok) {
    return {
      ok: false,
      code: moved.code,
      conflict: moved.conflict || null,
      error: rescheduleErrorMessage(moved.code, {
        conflict: moved.conflict,
        noticeDays: gate.noticeDays,
      }),
    };
  }

  const warnings = [...gate.warnings];
  if (moved.rearmed) warnings.push("hold_rearmed");

  // Keep the public listing, its per-session content and its guest-facing times
  // in step with the reservation that just moved.
  try {
    const sync = syncEventForBooking(id, {
      fromDate: moved.before.date,
      toDate,
      fromStart: moved.before.start_time,
      toStart,
      hours: Number(toHours ?? booking.hours) || 0,
    });
    warnings.push(...(sync.warnings || []));
  } catch (err) {
    console.error(`[reschedule] listing sync failed for #${id}:`, err.message);
    warnings.push("listing_sync_failed");
  }

  // More or less time changes what it costs.
  const money = toHours == null ? null : await settleLengthChange(booking, moved.before, { actor, refund });
  if (money?.warning) warnings.push(money.warning);

  const after = getBooking(id);
  const from = moved.before;
  const lengthNote = toHours == null ? "" : ` · ${hrs(from.hours)} → ${hrs(after.hours)}`;

  logActivity({
    bookingId: id,
    eventType: "rescheduled",
    description:
      (toHours == null
        ? `Date changed · ${formatDateShort(from.date)} ${formatTime(from.start_time)} → ${formatDateShort(after.date)} ${formatTime(after.start_time)}`
        : `Time changed · ${formatDateShort(from.date)} ${span(from.start_time, from.hours)} → ` +
          `${after.date === from.date ? "" : `${formatDateShort(after.date)} `}${span(after.start_time, after.hours)}${lengthNote}`) +
      (source === "client" ? " (by the client)" : ""),
    metadata: {
      from_date: from.date,
      from_start_time: from.start_time,
      to_date: after.date,
      to_start_time: after.start_time,
      from_hours: from.hours,
      to_hours: Number(after.hours),
      source,
      override: !!override,
      warnings,
    },
    ...actor,
  });

  // Tell the client, unless the owner moved it and chose not to.
  if (notify) {
    try {
      const res = await emailClientRescheduled(after, {
        fromDate: from.date,
        fromStartTime: from.start_time,
        fromHours: from.hours,
        movedBy: source === "client" ? "you" : "us",
        warnings,
        money,
      });
      logEmail({
        bookingId: id,
        eventType: "reschedule_sent",
        description: `${toHours == null ? "Date" : "Time"}-change confirmation sent · now ${formatDateShort(after.date)} ${formatTime(after.start_time)}`,
        recipientEmail: after.client_email,
        sendResult: res,
        ...SYSTEM_ACTOR,
      });
    } catch (err) {
      console.error(`[reschedule] client email failed for #${id}:`, err.message);
    }
  }

  // Only tell the owner when someone else did it — emailing them about their
  // own click is how people learn to ignore email.
  if (source === "client") {
    try {
      const res = await emailOwnerBookingRescheduled(after, {
        fromDate: from.date,
        fromStartTime: from.start_time,
        warnings,
      });
      logEmail({
        bookingId: id,
        eventType: "reschedule_sent",
        description: `Owner notified — ${after.client_name} moved their booking`,
        recipientEmail: recipientLabel(requestRecipients()),
        sendResult: res,
        ...SYSTEM_ACTOR,
      });
    } catch (err) {
      console.error(`[reschedule] owner email failed for #${id}:`, err.message);
    }
  }

  return { ok: true, booking: after, before: from, warnings, money };
}

/**
 * Catch the money up after a booking's length changed (applyBookingMove has
 * already set its new hours and total). Returns what happened, for the emails
 * and the admin's toast:
 *   { kind: "reissued", total, link }   unpaid: its invoice now has the new total
 *   { kind: "charge", amount, link }    paid, more time: an invoice for the difference
 *   { kind: "refund", amount }          paid, less time: refunded the difference
 *   { kind: "owed_back", amount }       paid, less time, owner chose not to refund
 *   { kind: "none" }                    free booking, nothing to settle
 * plus `warning` when Square needs a hand.
 */
async function settleLengthChange(before, moved, { actor, refund }) {
  const after = getBooking(before.id);
  const diff = Math.round((Number(after.rate) || 0) * (Number(after.hours) - moved.hours) * 100) / 100;
  const what = `${hrs(Math.abs(Number(after.hours) - moved.hours))} ${diff >= 0 ? "added" : "taken off"} · ${spaceName(after.space)}, ${formatDateShort(after.date)}`;
  if (!diff) return { kind: "none", diff: 0 };

  if (after.payment_status !== "paid") {
    if (!after.square_invoice_id && !after.payment_link) return { kind: "none", diff };
    try {
      const r = await reissueInvoice(after.id, { rate: after.rate, hours: after.hours, sessions: after.sessions, deposit: after.deposit }, actor, { email: false });
      if (r?.error === "already_paid") return { kind: "none", diff, warning: "paid_meanwhile" };
      const now = getBooking(after.id);
      return { kind: "reissued", diff, total: Number(now.total), link: now.payment_link, warning: r?.staleInvoiceWarning ? "stale_invoice" : null };
    } catch (err) {
      console.error(`[reschedule] reissue failed for #${after.id}:`, err.message);
      return { kind: "none", diff, warning: "invoice_failed" };
    }
  }

  if (diff > 0) {
    try {
      const c = await chargeBooking(after, diff, { description: what });
      logActivity({
        bookingId: after.id,
        eventType: "time_charge",
        description: `Invoice for added time · ${formatMoney(diff)} (${what})`,
        amount: diff,
        ...actor,
      });
      return { kind: "charge", diff, amount: diff, link: c.payment_link };
    } catch (err) {
      console.error(`[reschedule] extra-time invoice failed for #${after.id}:`, err.message);
      return { kind: "none", diff, warning: "invoice_failed" };
    }
  }

  const back = -diff;
  if (!refund) return { kind: "owed_back", diff, amount: back };
  try {
    const r = await refundAcrossInvoices(after, back, `Time taken off (${what})`);
    if (r.noPayment && !r.refunded) return { kind: "owed_back", diff, amount: back, warning: "no_square_payment" };
    recordRefund(after.id, r.refunded, what);
    logActivity({
      bookingId: after.id,
      eventType: "time_refund",
      description: `Refunded ${formatMoney(r.refunded)} for time taken off`,
      amount: r.refunded,
      ...actor,
    });
    return { kind: "refund", diff, amount: r.refunded };
  } catch (err) {
    console.error(`[reschedule] refund failed for #${after.id}:`, err.message);
    return { kind: "owed_back", diff, amount: back, warning: "refund_failed" };
  }
}

/** Mint (if needed) the client's private change-date link. */
export function rescheduleLinkFor(id) {
  const token = ensureRescheduleToken(id);
  if (!token) return null;
  const base = process.env.APP_URL || "http://localhost:3000";
  return `${base}/reschedule/${token}`;
}

/** One-line summary of a booking, for the owner's "it moved" email. */
export function bookingLabel(b) {
  return `${b.client_name} · ${spaceName(b.space)}`;
}

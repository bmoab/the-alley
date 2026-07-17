/**
 * Pure, client-safe metadata for the activity log (NO database import — this is
 * imported by client components like the drawer and the global feed).
 *
 * Each activity row has an `event_type`; here we map those to a visual category
 * (dot color) and a friendly label, plus a timezone-aware formatter. Timestamps
 * are stored UTC and displayed in America/Denver.
 */

export const ACTIVITY_TZ = "America/Denver";

// event_type → category. Categories drive the timeline dot color.
//   request = gold · email = blue · payment = green · action/approval = ink ·
//   refund/cancellation/denial = rust
export const EVENT_CATEGORY = {
  request_submitted: "request",

  owner_notified: "email",
  client_received: "email",
  invoice_sent: "email",
  invoice_resent: "email",
  invoice_reissued: "email",
  denial_sent: "email",
  confirmation_sent: "email",
  host_invite_sent: "email",
  host_reminder_sent: "email",
  deposit_reminder_sent: "email",
  payment_reminder_sent: "email",
  deposit_resolved_sent: "email",
  cancellation_sent: "email",
  hold_expired_sent: "email",

  payment_received: "payment",
  comped: "payment",

  approved: "action",
  restored: "action",
  archived: "action",
  unarchived: "action",
  hold_kept: "action",
  hold_rearmed: "action",
  host_listing_submitted: "action",
  settings_changed: "action",
  deposit_withheld: "action",

  denied: "refund",
  cancelled: "refund",
  deposit_refunded: "refund",
  hold_expired: "refund",
};

// Hex dot colors (inline-styled so Tailwind purge can't drop them).
export const CATEGORY_COLOR = {
  request: "#c89b4a", // gold
  email: "#2471a3", // blue
  payment: "#4a7c4e", // green
  action: "#2f2f2d", // ink
  refund: "#9c4a2e", // rust
};

export function categoryOf(eventType) {
  return EVENT_CATEGORY[eventType] || "action";
}

export function dotColor(eventType) {
  return CATEGORY_COLOR[categoryOf(eventType)];
}

// Friendly labels for the global feed's event-type filter.
export const TYPE_LABELS = {
  request_submitted: "Request submitted",
  owner_notified: "Owner notified",
  client_received: "Client acknowledgment",
  approved: "Approved",
  invoice_sent: "Invoice / payment link sent",
  invoice_resent: "Payment link resent",
  invoice_reissued: "Invoice repriced & reissued",
  denied: "Denied",
  denial_sent: "Denial email sent",
  restored: "Restored from denied",
  payment_received: "Payment received",
  comped: "Booked free of charge",
  confirmation_sent: "Confirmation sent",
  archived: "Archived",
  unarchived: "Restored from archive",
  hold_kept: "Kept on calendar (won't expire)",
  hold_rearmed: "Payment window re-armed",
  host_invite_sent: "Host listing invite sent",
  host_reminder_sent: "Host-details reminder sent",
  host_listing_submitted: "Host listing submitted",
  deposit_reminder_sent: "Deposit reminder sent",
  payment_reminder_sent: "Payment reminder sent",
  deposit_resolved_sent: "Deposit decision email sent",
  deposit_refunded: "Deposit refunded",
  deposit_withheld: "Deposit withheld",
  cancelled: "Booking cancelled",
  cancellation_sent: "Cancellation email sent",
  hold_expired: "Hold expired",
  hold_expired_sent: "Hold-expired email sent",
  settings_changed: "Settings changed",
};

export function typeLabel(eventType) {
  return TYPE_LABELS[eventType] || eventType;
}

// Delivery-tag colors for email entries.
export const DELIVERY_COLOR = {
  sent: { bg: "#eef0f4", fg: "#2471a3" },
  delivered: { bg: "#e8f2e9", fg: "#4a7c4e" },
  bounced: { bg: "#f6e7e1", fg: "#9c4a2e" },
  failed: { bg: "#f6e7e1", fg: "#9c4a2e" },
  unknown: { bg: "#eef0f4", fg: "#74746e" },
};

/** Normalize a stored timestamp (SQLite "YYYY-MM-DD HH:MM:SS" UTC, or ISO). */
function toDate(stored) {
  if (!stored) return null;
  let s = String(stored);
  // SQLite datetime('now') has no timezone — treat as UTC.
  if (!s.includes("T")) s = s.replace(" ", "T");
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(s)) s += "Z";
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** Day label in America/Denver, e.g. "June 2, 2026" (for timeline grouping). */
export function denverDayLabel(stored) {
  const d = toDate(stored);
  if (!d) return "";
  return d.toLocaleDateString("en-US", {
    timeZone: ACTIVITY_TZ,
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** Time of day in America/Denver, e.g. "2:14 PM". */
export function denverTime(stored) {
  const d = toDate(stored);
  if (!d) return "";
  return d.toLocaleTimeString("en-US", {
    timeZone: ACTIVITY_TZ,
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Short date + time for the global feed, e.g. "Jun 2 · 2:14 PM". */
export function denverShort(stored) {
  const d = toDate(stored);
  if (!d) return "";
  const date = d.toLocaleDateString("en-US", {
    timeZone: ACTIVITY_TZ,
    month: "short",
    day: "numeric",
  });
  return `${date} · ${denverTime(stored)}`;
}

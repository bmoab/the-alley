// Shared domain constants for The Alley On Center.

// Main Floor is listed first everywhere (spaces page, home teaser, booking +
// admin pickers). Order here is the single source of truth; all other logic is
// keyed by id (order-agnostic).
export const SPACES = [
  {
    id: "main",
    name: "The Alley Main Floor",
    location: "Downstairs",
    capacity: "Flexible capacity",
    blurb:
      "Our open, adaptable ground floor, designed to flex around the moment you're making — receptions, classes, pop-ups, and gatherings of every shape.",
    features: ["Open, flexible floor", "Gallery walls", "Ground-floor access", "Great for markets & pop-ups"],
    gallery: [
      { tag: "main floor · downstairs", variant: "soft" },
      { tag: "the gallery walls", variant: "verde" },
      { tag: "reception setup", variant: "" },
      { tag: "pop-up market", variant: "soft" },
    ],
  },
  {
    id: "loft",
    name: "The Alley Loft",
    location: "Upstairs",
    capacity: "Up to 30 guests",
    blurb:
      "A space created for connection, creativity, and shared moments — where business blends with belonging and ideas turn into experiences. Just right for workshops, meetings, markets, and celebrations.",
    features: ["Seats up to 30", "Tables & chairs included", "Street-facing windows", "Kitchenette access"],
    gallery: [
      { tag: "the loft · upstairs", variant: "verde" },
      { tag: "set for a workshop", variant: "soft" },
      { tag: "street-facing windows", variant: "" },
      { tag: "market day", variant: "verde" },
    ],
  },
];

export const SPACE_BY_ID = Object.fromEntries(SPACES.map((s) => [s.id, s]));

export function spaceName(id) {
  return SPACE_BY_ID[id]?.name ?? id;
}

export const EVENT_TYPES = [
  "Birthday party",
  "Baby/bridal shower",
  "Corporate event",
  "Workshop or class",
  "Private gathering",
  "Other",
];

export const GUEST_RANGES = [
  "1–10",
  "11–20",
  "21–30",
  "31–50",
  "50+",
];

// Booking status vocabulary (kept in one place for consistency).
// NOTE: "held" is the approved-awaiting-payment state (what the contract/owner
// calls "approved"). Bookings are never hard-deleted — only their status
// changes (soft-delete), so "denied"/"cancelled" rows are retained for history.
export const BOOKING_STATUS = {
  PENDING: "pending",
  HELD: "held",
  RESERVED: "reserved", // recurring-series date: holds the slot, awaits per-date payment, never auto-expires
  CONFIRMED: "confirmed",
  DENIED: "denied",
  COMPLETED: "completed",
  EXPIRED: "expired",
  CANCELLED: "cancelled",
};

// Statuses that occupy a time slot and therefore block double-booking.
// "cancelled" is intentionally absent: a cancelled booking frees its slot.
// "reserved" blocks like "held" but has no hold_expires_at, so the expiry
// sweep (which targets held + hold_expires_at) never releases series dates.
export const BLOCKING_STATUSES = ["held", "reserved", "confirmed", "completed"];

/**
 * The event's start as a local Date, combining the booking's date (YYYY-MM-DD)
 * and start_time (HH:MM). Used for the cancellation cutoff math.
 */
export function getEventStart(booking) {
  if (!booking?.date) return null;
  const [y, m, d] = booking.date.split("-").map(Number);
  const [hh, mm] = (booking.start_time || "00:00").split(":").map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
}

/** Format an "HH:MM" 24h string as a friendly "8:00 AM". */
export function formatTime(hhmm) {
  if (!hhmm) return "";
  const [hStr, mStr] = hhmm.split(":");
  let h = parseInt(hStr, 10);
  const m = mStr ?? "00";
  const period = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${m} ${period}`;
}

/** Format a YYYY-MM-DD string as "Saturday, June 14, 2026" without TZ drift. */
export function formatDate(ymd) {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Compact date for dense admin tables, e.g. "Sat, Jun 27, 2026" (no TZ drift). */
export function formatDateShort(ymd) {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatMoney(amount) {
  const n = Number(amount) || 0;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/**
 * Today as YYYY-MM-DD in the venue's timezone. Booking dates are stored as bare
 * local dates, so "is this in the past?" must be judged against Denver's today,
 * not the server's UTC day — otherwise evening bookings read as past.
 */
export function venueToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Shift a YYYY-MM-DD by N days / months, staying calendar-correct. */
function shift(ymd, { days = 0, months = 0 }) {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(y, m - 1 + months, d + days);
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/**
 * Date-range presets for the admin bookings list. `range()` returns
 * { from, to } as YYYY-MM-DD (null = unbounded). "upcoming" is the default:
 * today forward, so finished events drop off the list on their own.
 */
export const DATE_PRESETS = [
  { key: "upcoming", label: "Upcoming", range: (t) => ({ from: t, to: null }) },
  { key: "next30", label: "Next 30 days", range: (t) => ({ from: t, to: shift(t, { days: 30 }) }) },
  { key: "next6m", label: "Next 6 months", range: (t) => ({ from: t, to: shift(t, { months: 6 }) }) },
  { key: "next1y", label: "Next year", range: (t) => ({ from: t, to: shift(t, { months: 12 }) }) },
  { key: "last30", label: "Last 30 days", range: (t) => ({ from: shift(t, { days: -30 }), to: t }) },
  { key: "last6m", label: "Last 6 months", range: (t) => ({ from: shift(t, { months: -6 }), to: t }) },
  { key: "all", label: "All time", range: () => ({ from: null, to: null }) },
  { key: "custom", label: "Custom…", range: () => ({ from: null, to: null }) },
];

export const DEFAULT_DATE_PRESET = "upcoming";

/**
 * Resolve a preset key (+ custom from/to) into concrete bounds. Unknown keys
 * fall back to the default. For "custom" the caller's from/to pass through.
 */
export function resolveDateRange(presetKey, { from = "", to = "" } = {}, now = new Date()) {
  const today = venueToday(now);
  if (presetKey === "custom") return { from: from || null, to: to || null };
  const preset =
    DATE_PRESETS.find((p) => p.key === presetKey) ||
    DATE_PRESETS.find((p) => p.key === DEFAULT_DATE_PRESET);
  return preset.range(today);
}

/** "Jul–Sep 2026" from two YYYY-MM-DD bounds (either may be missing). */
export function formatMonthRange(from, until) {
  const parse = (s) => {
    if (!s) return null;
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d || 1);
  };
  const mon = (dt) => dt.toLocaleDateString("en-US", { month: "short" });
  const a = parse(from);
  const b = parse(until);
  if (a && b) {
    return a.getFullYear() === b.getFullYear()
      ? `${mon(a)}–${mon(b)} ${b.getFullYear()}`
      : `${mon(a)} ${a.getFullYear()} – ${mon(b)} ${b.getFullYear()}`;
  }
  const one = a || b;
  return one ? `${mon(one)} ${one.getFullYear()}` : "";
}

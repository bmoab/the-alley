// Shared domain constants for The Alley On Center.

export const SPACES = [
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
export const BOOKING_STATUS = {
  PENDING: "pending",
  HELD: "held",
  CONFIRMED: "confirmed",
  DENIED: "denied",
  COMPLETED: "completed",
  EXPIRED: "expired",
};

// Statuses that occupy a time slot and therefore block double-booking.
export const BLOCKING_STATUSES = ["held", "confirmed", "completed"];

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

export function formatMoney(amount) {
  const n = Number(amount) || 0;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
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

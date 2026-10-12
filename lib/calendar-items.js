import { listBookings } from "./bookings.js";
import { listAdminCalendarEvents, listingIndex } from "./catalog.js";
import { listClosures } from "./closures.js";
import { SPACES, spaceName, formatTime, shiftDate, venueToday } from "./constants.js";
import { listShifts, weekStart } from "./staff.js";

/**
 * The admin calendar's chips (server-only): bookings, listings, cancelled
 * nights and who's on shift, plus full-day closures — for the calendar at the
 * top of the Events page. Every chip opens its details in a side panel on that
 * same page: ?b=<id> for a booking, ?ev=<id> for a listing with no booking.
 */

// Closure targets: every space, plus the whole building.
export const SPACE_LABEL = {
  all: "Whole building",
  ...Object.fromEntries(SPACES.map((s) => [s.id, s.name])),
};

// Room ids the calendar can colour by.
const SPACE_IDS = new Set(SPACES.map((s) => s.id));

// Why a listing isn't on the public calendar, in the owner's words. Keys are the
// reasons listAdminCalendarEvents() returns: 'private' is a deliberate choice,
// every other value is the booking status that took the listing down with it.
const HIDDEN_REASON = {
  private: "hidden — set to private",
  archived: "not showing — its booking was archived",
  cancelled: "not showing — its booking was cancelled",
  denied: "not showing — its booking was denied",
  expired: "not showing — its hold expired",
  pending: "not showing — its booking isn't approved yet",
};

/** Full-day closures as calendar markers: { "YYYY-MM-DD": ["Whole building", …] }. */
export function closedDateMarkers(closures = listClosures()) {
  const closedDates = {};
  for (const c of closures) {
    if (c.start_time && c.end_time) continue; // partial closures aren't day markers
    let d = c.start_date;
    while (d <= c.end_date) {
      (closedDates[d] ||= []).push(SPACE_LABEL[c.space] || c.space);
      d = shiftDate(d, { days: 1 });
    }
  }
  return closedDates;
}

export function adminCalendarItems({ base = "/admin/events" } = {}) {
  const held = listBookings({ status: "held" });
  const confirmed = listBookings({ status: "confirmed" });
  const cancelled = listBookings({ status: "cancelled" });
  const events = listAdminCalendarEvents();

  // ONE CHIP PER NIGHT. A booked public event is two records — the booking (the
  // room, the money, the client) and the listing (what guests see) — and drawing
  // both put two chips on one evening, which reads as two different events. The
  // booking chip absorbs its listing: it takes the listing's title and its
  // public/hidden colour, and opens the booking, whose panel links the listing.
  const { byBooking, bySeries } = listingIndex();
  // A series has ONE listing, on the session holding it, so a plain session of
  // that series has to fall back to the series.
  const listingFor = (b) => byBooking[b.id] || (b.series_id != null ? bySeries[b.series_id] : null);

  // Every listing some booking chip already stands for, as `${listingId}|${date}`
  // — built from cancelled bookings too, and BEFORE the listing chips below.
  const covered = new Set();
  for (const b of [...held, ...confirmed, ...cancelled]) {
    const listing = listingFor(b);
    if (listing) covered.add(`${listing.id}|${b.date}`);
  }

  const bookingItems = [...held, ...confirmed].map((b) => {
    const listing = listingFor(b);
    // Filled when guests can see it, outlined when they can't — and "can't"
    // covers both a listing you've hidden and a booking that never had one.
    const isPublic = listing?.status === "live";
    return {
      id: b.id,
      date: b.date,
      time: b.start_time,
      kind: isPublic ? b.space : `${b.space}-private`,
      title: listing?.title || b.client_name || spaceName(b.space),
      meta:
        `${b.status} · ${b.hours}h${b.event_type ? ` · ${b.event_type}` : ""}` +
        (isPublic ? " · on the public calendar" : listing ? ` · ${HIDDEN_REASON.private}` : " · no public listing"),
      href: `${base}?b=${b.id}`,
    };
  });

  // Listings no booking chip already stands for: The Alley's own events, and
  // anything whose booking isn't drawn on the calendar.
  const eventItems = events
    .filter((e) => !covered.has(`${e.id}|${e.date}`))
    .map((e) => ({
      id: e.id,
      date: e.date,
      time: e.time,
      // A listing whose booking isn't drawn still knows its room; only The
      // Alley's own events (no booking, no room) fall back to rust.
      kind: SPACE_IDS.has(e.space)
        ? e.hiddenReason
          ? `${e.space}-private`
          : e.space
        : e.hiddenReason
          ? "eventHidden"
          : "event",
      title: e.title || (e.hiddenReason ? "Hidden listing" : "Public event"),
      meta: e.hiddenReason
        ? HIDDEN_REASON[e.hiddenReason] || `not on the public calendar (${e.hiddenReason})`
        : e.host_name
          ? `Hosted by ${e.host_name}`
          : "",
      href: `${base}?ev=${e.id}`,
    }));

  // Cancelled bookings stay visible (greyed) for the record, but no longer
  // block the slot.
  const cancelledItems = cancelled.map((b) => ({
    id: b.id,
    date: b.date,
    time: b.start_time,
    kind: "cancelled",
    title: `${b.client_name || spaceName(b.space)} (cancelled)`,
    meta: `${spaceName(b.space)} · cancelled`,
    href: `${base}?b=${b.id}`,
  }));

  // Staff on shift: ONE summary chip per day rather than a chip per person, so a
  // fully staffed Saturday doesn't push the night's events under "+3 more". It
  // opens that week of the schedule; the tooltip names who's on.
  const today = venueToday();
  const shiftsByDate = {};
  for (const s of listShifts({ from: shiftDate(today, { months: -6 }), to: shiftDate(today, { months: 12 }) })) {
    (shiftsByDate[s.date] ||= []).push(s);
  }
  const staffItems = Object.entries(shiftsByDate).map(([date, list]) => {
    const people = list.filter((s) => s.employee_id).length;
    const open = list.length - people;
    const drafts = list.filter((s) => s.status === "draft").length;
    return {
      id: date,
      date,
      kind: "staff",
      title: `${people} on shift${open ? ` · ${open} open` : ""}`,
      meta:
        list.map((s) => `${s.employee_name || "Open"} ${formatTime(s.start_time)}–${formatTime(s.end_time)}`).join(", ") +
        (drafts ? ` · ${drafts} not published yet` : ""),
      href: `/admin/schedule?week=${weekStart(date)}`,
    };
  });

  return [...bookingItems, ...eventItems, ...cancelledItems, ...staffItems];
}

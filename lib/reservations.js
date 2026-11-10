import { customAlphabet } from "nanoid";
import { db } from "./db.js";
import { listingIndex } from "./catalog.js";
import { spaceName, venueToday, shiftDate } from "./constants.js";
import { isTime, toMinutes } from "./event-time.js";

/**
 * Alley Reservations (server-only): every booking in the building, public and
 * private, for someone who has to know when rooms are used — the cleaner.
 *
 * Turned on per directory business ("Sees Alley Reservations" on its Directory
 * page). It shows on that business's account and as a private calendar feed.
 * What it shares is deliberately thin: when, which room, how many, alcohol, and
 * a title only where the public already sees one. Never a renter's name,
 * contact details or money.
 */

const feedToken = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789", 32);

// A booking that's still happening: approved (held), a later session of a
// series (reserved), paid (confirmed), or done today (completed).
const STANDING = ["held", "reserved", "confirmed", "completed"];

/** Does this directory business see Alley Reservations? */
export function seesReservations(directoryId) {
  return !!db.prepare("SELECT 1 FROM directory WHERE id = ? AND sees_reservations = 1").get(directoryId);
}

/**
 * Switch it on or off. On gives the business a private feed token (kept if it
 * had one); off removes the token, so an old subscribed calendar stops working.
 */
export function setSeesReservations(directoryId, on) {
  if (on) {
    db.prepare(
      "UPDATE directory SET sees_reservations = 1, reservations_token = COALESCE(reservations_token, ?) WHERE id = ?"
    ).run(feedToken(), directoryId);
  } else {
    db.prepare("UPDATE directory SET sees_reservations = 0, reservations_token = NULL WHERE id = ?").run(directoryId);
  }
}

/** The business a feed token belongs to, if it still sees reservations. */
export function reservationsFeedOwner(token) {
  const t = String(token || "").replace(/\.ics$/i, "");
  if (t.length < 20) return null;
  return db
    .prepare("SELECT id, business_name FROM directory WHERE reservations_token = ? AND sees_reservations = 1")
    .get(t) || null;
}

export function reservationsFeedUrl(token) {
  return `${(process.env.APP_URL || "https://alleyoncenter.com").replace(/\/$/, "")}/reservations/${token}.ics`;
}

const plusHours = (hhmm, hours) => {
  const m = toMinutes(hhmm);
  if (m == null) return { time: null, days: 0 };
  const total = m + Math.round((Number(hours) || 0) * 60);
  const h = Math.floor(total / 60);
  return { time: `${String(h % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`, days: Math.floor(h / 24) };
};

/**
 * Reservations from `from` through `to` (YYYY-MM-DD, inclusive), soonest
 * first. Each one:
 *   { key, date, title, isPublic, kind, space, start, end, endDate,
 *     guestStart, guestEnd, guests, alcohol, unconfirmed }
 * start/end are when the room is booked (setup and teardown included);
 * guestStart/guestEnd are when guests come, when the listing says.
 */
export function listReservations({ from = venueToday(), to = shiftDate(venueToday(), { days: 60 }) } = {}) {
  const { byBooking, bySeries } = listingIndex();
  const listingFor = (b) => byBooking[b.id] || (b.series_id != null ? bySeries[b.series_id] : null);
  const times = db.prepare("SELECT public_time, public_end_time FROM events WHERE id = ?");

  const bookings = db
    .prepare(
      `SELECT id, date, start_time, hours, space, guests, alcohol, event_type, status, series_id
         FROM bookings
        WHERE archived = 0 AND status IN (${STANDING.map(() => "?").join(",")}) AND date >= ? AND date <= ?
        ORDER BY date, start_time`
    )
    .all(...STANDING, from, to);

  const out = bookings.map((b) => {
    const listing = listingFor(b);
    const isPublic = listing?.status === "live";
    const t = listing ? times.get(listing.id) : null;
    const end = plusHours(b.start_time, b.hours);
    return {
      key: `b${b.id}`,
      uid: `alley-res-b${b.id}@alleyoncenter.com`,
      date: b.date,
      title: isPublic ? listing.title || "Public event" : "Private rental",
      isPublic,
      kind: isPublic ? "Public event" : b.event_type && b.event_type !== "Other" ? b.event_type : "",
      space: spaceName(b.space),
      start: isTime(b.start_time) ? b.start_time : null,
      end: end.time,
      endDate: end.days ? shiftDate(b.date, { days: end.days }) : b.date,
      guestStart: isPublic && isTime(t?.public_time) ? t.public_time : null,
      guestEnd: isPublic && isTime(t?.public_end_time) ? t.public_end_time : null,
      guests: Number(b.guests) || null,
      alcohol: /^(yes|true|1)$/i.test(String(b.alcohol ?? "")),
      unconfirmed: b.status === "held",
    };
  });

  // The Alley's own events (Art Walk, markets, parties) — no booking behind them.
  const own = db
    .prepare(
      `SELECT id, title, date, time, public_time, public_end_time, space, status
         FROM events
        WHERE booking_id IS NULL AND tenant_id IS NULL AND status IN ('live', 'private') AND date >= ? AND date <= ?`
    )
    .all(from, to);
  for (const e of own) {
    const start = isTime(e.time) ? e.time : isTime(e.public_time) ? e.public_time : null;
    const end = isTime(e.public_end_time) ? e.public_end_time : null;
    out.push({
      key: `e${e.id}`,
      uid: `alley-res-e${e.id}@alleyoncenter.com`,
      date: e.date,
      title: e.title || "Alley event",
      isPublic: e.status === "live",
      kind: "The Alley's event",
      space: e.space ? spaceName(e.space) : "The Alley",
      start,
      end,
      endDate: e.date,
      guestStart: isTime(e.public_time) && e.public_time !== start ? e.public_time : null,
      guestEnd: isTime(e.public_time) && e.public_time !== start ? end : null,
      guests: null,
      alcohol: false,
      unconfirmed: false,
    });
  }

  return out.sort((a, b) => (a.date + (a.start || "00:00")).localeCompare(b.date + (b.start || "00:00")));
}

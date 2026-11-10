import { listReservations, reservationsFeedOwner } from "@/lib/reservations.js";
import { venueToday, shiftDate } from "@/lib/constants.js";
import { fmtRange } from "@/lib/shift-format.js";

export const dynamic = "force-dynamic";

/**
 * Alley Reservations as a private calendar feed: every booking in the building,
 * for a business switched on to see them (the cleaner). The token in the
 * address is the only key; switching them off removes it, and an old
 * subscription then gets an empty calendar rather than an error.
 */
const TZID = "America/Denver";

const esc = (s) =>
  String(s || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");

const ymd = (d) => d.replaceAll("-", "");
const hm = (t) => t.replace(":", "") + "00";

function calendar(lines) {
  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//The Alley On Center//Reservations//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Alley Reservations",
    `X-WR-TIMEZONE:${TZID}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...lines,
    "END:VCALENDAR",
  ].join("\r\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="alley-reservations.ics"',
      "Cache-Control": "private, no-store",
    },
  });
}

export function GET(_req, { params }) {
  if (!reservationsFeedOwner(params.token)) return calendar([]);

  const today = venueToday();
  const rows = listReservations({ from: shiftDate(today, { days: -14 }), to: shiftDate(today, { months: 12 }) });
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");

  const lines = [];
  for (const r of rows) {
    let start, end;
    if (r.start) {
      start = `DTSTART;TZID=${TZID}:${ymd(r.date)}T${hm(r.start)}`;
      end = r.end
        ? `DTEND;TZID=${TZID}:${ymd(r.endDate)}T${hm(r.end)}`
        : `DTEND;TZID=${TZID}:${ymd(r.date)}T${hm(r.start)}`;
    } else {
      start = `DTSTART;VALUE=DATE:${ymd(r.date)}`;
      end = `DTEND;VALUE=DATE:${ymd(shiftDate(r.date, { days: 1 }))}`;
    }
    const notes = [
      r.kind,
      r.start ? `Room booked ${fmtRange(r.start, r.end)} (setup and cleanup included)` : "No time set yet",
      r.guestStart ? `Guests ${fmtRange(r.guestStart, r.guestEnd)}` : null,
      r.guests ? `${r.guests} guests` : null,
      r.alcohol ? "Alcohol" : null,
      r.unconfirmed ? "Approved, not paid yet" : null,
    ].filter(Boolean);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${r.uid}`,
      `DTSTAMP:${stamp}`,
      start,
      end,
      `SUMMARY:${esc(`${r.title} · ${r.space}`)}`,
      `DESCRIPTION:${esc(notes.join("\n"))}`,
      `LOCATION:${esc(`${r.space}, The Alley On Center`)}`,
      "END:VEVENT"
    );
  }
  return calendar(lines);
}

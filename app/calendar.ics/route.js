import { listLiveEvents } from "@/lib/catalog.js";
import { getContentValue } from "@/lib/db.js";

export const dynamic = "force-dynamic";

/**
 * Public iCal feed of the website's live events. Subscribe to this URL from
 * Google Calendar ("Other calendars → From URL") and from Skylight ("Add a
 * calendar → iCal/URL"). One-way: the website is the source of truth.
 *
 * Times are emitted in America/Denver (Logan, UT) so they land correctly.
 */
const TZID = "America/Denver";

function esc(s) {
  return String(s || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function addHoursToTime(timeStr, add) {
  const [h, m] = timeStr.split(":").map(Number);
  const total = h * 60 + m + add * 60;
  return { h: Math.floor(total / 60), m: total % 60, overflow: total >= 24 * 60 };
}

export async function GET() {
  const events = listLiveEvents();
  const appUrl = getContentValue("app_url", process.env.APP_URL || "");
  const address = getContentValue("contact_address", "19 W Center St., Logan, UT 84321");
  const now = new Date();
  const stamp =
    now.getUTCFullYear() +
    pad(now.getUTCMonth() + 1) +
    pad(now.getUTCDate()) +
    "T" +
    pad(now.getUTCHours()) +
    pad(now.getUTCMinutes()) +
    pad(now.getUTCSeconds()) +
    "Z";

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//The Alley On Center//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:The Alley On Center — Events",
    `X-WR-TIMEZONE:${TZID}`,
  ];

  for (const e of events) {
    if (!e.date) continue;
    const [y, mo, d] = e.date.split("-");
    let dtStart, dtEnd;
    if (e.time) {
      const [hh, mm] = e.time.split(":");
      dtStart = `DTSTART;TZID=${TZID}:${y}${mo}${d}T${hh}${mm}00`;
      const end = addHoursToTime(e.time, 2);
      // Keep the end on the same day (clamp) for simplicity.
      const eh = end.overflow ? 23 : end.h;
      const em = end.overflow ? 59 : end.m;
      dtEnd = `DTEND;TZID=${TZID}:${y}${mo}${d}T${pad(eh)}${pad(em)}00`;
    } else {
      // All-day event.
      dtStart = `DTSTART;VALUE=DATE:${y}${mo}${d}`;
      dtEnd = `DTEND;VALUE=DATE:${y}${mo}${d}`;
    }
    // Deep-link each session to its own date so the right one opens.
    const eventUrl = appUrl ? `${appUrl}/events/${e.id}${e.date ? `?d=${e.date}` : ""}` : null;
    const descParts = [];
    if (e.description) descParts.push(e.description);
    if (e.host_name) descParts.push(`Hosted by ${e.host_name}`);
    if (eventUrl) descParts.push(eventUrl);

    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid || `event-${e.id}@alleyoncenter.com`}`,
      `DTSTAMP:${stamp}`,
      dtStart,
      dtEnd,
      `SUMMARY:${esc(e.title || "Event")}`,
      `DESCRIPTION:${esc(descParts.join("\n\n"))}`,
      `LOCATION:${esc("The Alley On Center, " + address)}`,
      eventUrl ? `URL:${esc(eventUrl)}` : null,
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");
  const body = lines.filter((l) => l !== null).join("\r\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="the-alley-events.ics"',
      "Cache-Control": "public, max-age=300",
    },
  });
}

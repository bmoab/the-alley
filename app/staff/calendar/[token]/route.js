import { getEmployeeByIcsToken, listShifts } from "@/lib/staff.js";
import { getContentValue } from "@/lib/db.js";
import { shiftDate, venueToday } from "@/lib/constants.js";

export const dynamic = "force-dynamic";

/**
 * One employee's published shifts as an iCal feed, for subscribing from their
 * phone. The token in the URL is the only credential (same idea as the public
 * /calendar.ics, but private to one person). Times are venue-local, emitted
 * with TZID so they land right wherever the phone is.
 */
const TZID = "America/Denver";

function esc(s) {
  return String(s || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

const pad = (n) => String(n).padStart(2, "0");
const compact = (ymd, hhmm) => `${ymd.replace(/-/g, "")}T${hhmm.replace(":", "")}00`;

export async function GET(_request, { params }) {
  const token = String(params.token || "").replace(/\.ics$/i, "");
  const employee = getEmployeeByIcsToken(token);
  if (!employee) return new Response("Not found", { status: 404 });

  const today = venueToday();
  const shifts = listShifts({
    from: shiftDate(today, { days: -30 }),
    to: shiftDate(today, { months: 6 }),
    employeeId: employee.id,
    publishedOnly: true,
  });
  const address = getContentValue("contact_address", "19 W Center St., Logan, UT 84321");
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(
    now.getUTCHours()
  )}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//The Alley On Center//Staff shifts//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(`The Alley — ${employee.name.split(" ")[0]}'s shifts`)}`,
    `X-WR-TIMEZONE:${TZID}`,
  ];
  for (const s of shifts) {
    // An end at or before the start runs past midnight into the next day.
    const endDate = s.end_time <= s.start_time ? shiftDate(s.date, { days: 1 }) : s.date;
    lines.push(
      "BEGIN:VEVENT",
      `UID:shift-${s.id}@alleyoncenter.com`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=${TZID}:${compact(s.date, s.start_time)}`,
      `DTEND;TZID=${TZID}:${compact(endDate, s.end_time)}`,
      `SUMMARY:${esc(`Shift at The Alley${s.role ? ` · ${s.role}` : ""}`)}`,
      s.note ? `DESCRIPTION:${esc(s.note)}` : null,
      `LOCATION:${esc("The Alley On Center, " + address)}`,
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");

  return new Response(lines.filter(Boolean).join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="alley-shifts.ics"',
      "Cache-Control": "private, max-age=300",
    },
  });
}

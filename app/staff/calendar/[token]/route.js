export const dynamic = "force-dynamic";

/**
 * The old per-employee shifts feed. Shifts live in Square now, so this answers
 * with an EMPTY calendar: a phone still subscribed quietly clears the old
 * shifts on its next refresh instead of showing a sync error forever.
 */
export function GET() {
  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//The Alley On Center//Shifts//EN",
    "X-WR-CALNAME:The Alley — my shifts (now in Square Team)",
    "END:VCALENDAR",
  ].join("\r\n");
  return new Response(body, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store" } });
}

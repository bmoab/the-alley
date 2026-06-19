import { NextResponse } from "next/server";
import { getAvailableStartTimes, getDayAvailability } from "@/lib/bookings.js";
import { SPACE_BY_ID } from "@/lib/constants.js";

export const dynamic = "force-dynamic";

/**
 * GET /api/availability
 *
 *  - ?space=loft&date=2026-06-14&hours=2
 *      → { slots: [{ time, available }] } for that single day.
 *
 *  - ?space=loft&month=2026-06&hours=2
 *      → { days: { "2026-06-01": openCount, … } } open start-time counts for the
 *        whole month, used to draw the calendar availability dots.
 *
 * Already-taken slots (incl. the cleanup buffer) are reflected in both forms.
 */
export function GET(request) {
  const { searchParams } = new URL(request.url);
  const space = searchParams.get("space");
  const date = searchParams.get("date");
  const month = searchParams.get("month");
  const hours = Number(searchParams.get("hours") || 2);

  if (!space || !SPACE_BY_ID[space]) {
    return NextResponse.json({ error: "Unknown space" }, { status: 400 });
  }

  if (month) {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: "Invalid month" }, { status: 400 });
    }
    const [y, m] = month.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const days = {};
    for (let d = 1; d <= lastDay; d++) {
      const ds = `${month}-${String(d).padStart(2, "0")}`;
      days[ds] = getDayAvailability(space, ds, hours).open;
    }
    return NextResponse.json({ space, month, hours, days });
  }

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const slots = getAvailableStartTimes(space, date, hours);
  return NextResponse.json({ space, date, hours, slots });
}

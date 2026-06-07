import { NextResponse } from "next/server";
import { getAvailableStartTimes } from "@/lib/bookings.js";
import { SPACE_BY_ID } from "@/lib/constants.js";

/**
 * GET /api/availability?space=loft&date=2026-06-14&hours=2
 * Returns the bookable start times for that space/date/duration, with each
 * already-taken slot marked unavailable (double-booking prevention).
 */
export function GET(request) {
  const { searchParams } = new URL(request.url);
  const space = searchParams.get("space");
  const date = searchParams.get("date");
  const hours = Number(searchParams.get("hours") || 2);

  if (!space || !SPACE_BY_ID[space]) {
    return NextResponse.json({ error: "Unknown space" }, { status: 400 });
  }
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const slots = getAvailableStartTimes(space, date, hours);
  return NextResponse.json({ space, date, hours, slots });
}

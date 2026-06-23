import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth.js";
import { getBooking } from "@/lib/bookings.js";
import { listActivity } from "@/lib/activity.js";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/activity?bookingId=123
 * Returns a booking + its activity timeline for the side drawer. Admin-only.
 */
export async function GET(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const bookingId = Number(searchParams.get("bookingId"));
  if (!bookingId) {
    return NextResponse.json({ error: "bookingId required" }, { status: 400 });
  }

  const booking = getBooking(bookingId);
  if (!booking) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({ booking, activity: listActivity(bookingId) });
}

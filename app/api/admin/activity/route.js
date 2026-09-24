import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth.js";
import { getBooking } from "@/lib/bookings.js";
import { listActivity } from "@/lib/activity.js";
import { getListingForBooking } from "@/lib/catalog.js";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/activity?bookingId=123
 * Returns a booking, its activity timeline, and its public listing (if any) for
 * the side drawer. Admin-only.
 *
 * The listing rides along so the drawer is one stop for the whole evening: the
 * room and the money on one side, what guests see on the other. Without it the
 * calendar had to draw a second chip just to reach the listing, which read as a
 * duplicate event on the same night.
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

  const listing = getListingForBooking(bookingId);
  return NextResponse.json({
    booking,
    activity: listActivity(bookingId),
    listing: listing
      ? {
          id: listing.id,
          title: listing.title,
          status: listing.status,
          hostPosted: Boolean(listing.host_posted),
        }
      : null,
  });
}

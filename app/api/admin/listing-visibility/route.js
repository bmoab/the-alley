import { NextResponse } from "next/server";
import { getCurrentUser, getActor, requireBookingManager } from "@/lib/auth.js";
import { getEvent, setEventStatus } from "@/lib/catalog.js";
import { setBookingListingPublic } from "@/lib/listing-visibility.js";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/listing-visibility
 *   { eventId, public }    — flip a listing that already exists
 *   { bookingId, public }  — put a BOOKING on the calendar, creating its
 *                            listing (and emailing the host their posting
 *                            link) if it doesn't have one yet
 *
 * The drawer is a client component that rides on every admin page, so it can't
 * call a page's server action — it posts here instead. Same effects and the
 * same activity-log entries as the switches under Public Events and the
 * booking's ⋯ menu, just reached from the booking.
 */
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const makePublic = Boolean(body?.public);

  // Creating a listing sends the host an email and changes what guests see, so
  // it takes the same permission as the ⋯ menu that does it on the list page.
  const bookingId = Number(body?.bookingId);
  if (bookingId) {
    if (!(await requireBookingManager())) {
      return NextResponse.json({ error: "You don't have permission to do that." }, { status: 403 });
    }
    const result = await setBookingListingPublic({
      bookingId,
      makePublic,
      actor: await getActor(),
      via: "booking drawer",
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
    return NextResponse.json(result);
  }

  const eventId = Number(body?.eventId);
  if (!eventId) {
    return NextResponse.json({ error: "eventId or bookingId required" }, { status: 400 });
  }

  const existing = getEvent(eventId);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Only a reviewed listing is the owner's to flip from here. One still awaiting
  // review is a decision that belongs on the Public Events page, with the host's
  // submission in front of you.
  if (existing.status !== "live" && existing.status !== "private") {
    return NextResponse.json(
      { error: "This listing is still awaiting review — publish it from Public Events." },
      { status: 409 }
    );
  }

  const updated = setEventStatus(eventId, makePublic ? "live" : "private", {
    actor: await getActor(),
    via: "booking drawer",
  });

  return NextResponse.json({ ok: true, id: updated.id, status: updated.status });
}

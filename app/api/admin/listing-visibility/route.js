import { NextResponse } from "next/server";
import { getCurrentUser, getActor } from "@/lib/auth.js";
import { getEvent, setEventStatus } from "@/lib/catalog.js";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/listing-visibility  { eventId, public: true|false }
 *
 * Show or hide a listing from the booking drawer. The drawer is a client
 * component that rides on every admin page, so it can't call a page's server
 * action — it posts here instead. Same effect as the switch under Public
 * Events, same activity-log entry, just reached from the booking.
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

  const eventId = Number(body?.eventId);
  if (!eventId) return NextResponse.json({ error: "eventId required" }, { status: 400 });

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

  const updated = setEventStatus(eventId, body.public ? "live" : "private", {
    actor: await getActor(),
    via: "booking drawer",
  });

  return NextResponse.json({ id: updated.id, status: updated.status });
}

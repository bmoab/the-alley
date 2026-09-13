import Link from "next/link";
import { revalidatePath } from "next/cache";
import { getEventByToken, saveHostListing, findLastEventByHostEmail, getEventSessions, getEventBookingWindow, isReviewedListing } from "@/lib/catalog.js";
import { getSetting } from "@/lib/db.js";
import { logActivity, logEmail } from "@/lib/activity.js";
import { emailOwnerListingVisibility } from "@/lib/email.js";
import { requestRecipients, recipientLabel } from "@/lib/notify.js";
import HostListingForm from "@/components/HostListingForm.js";

export const metadata = { title: "Post your event" };

export default function HostListingPage({ params }) {
  const event = getEventByToken(params.token);

  if (!event) {
    return (
      <main className="brandpage flex min-h-screen items-center justify-center bg-paper-warm px-5">
        <div className="card max-w-md p-8 text-center">
          <h1 className="font-display text-2xl font-semibold text-ink">
            Link not found
          </h1>
          <p className="mt-3 text-ink-muted">
            This event link is invalid or has expired. If you booked a public
            event, check your confirmation email for the correct link.
          </p>
          <Link href="/" className="btn-primary mt-6">Visit The Alley</Link>
        </div>
      </main>
    );
  }

  const alreadyLive = event.status === "live";
  // Once a listing has been through review it's the host's to show or hide, so
  // they get the public/private switch. Before that there's nothing to hide —
  // it isn't on the calendar yet — and publishing is still the owner's call.
  const canSetVisibility = isReviewedListing(event);
  // "We'll review it first" is true for exactly one case: a listing that hasn't
  // been published yet, on a site where the owner hasn't turned auto-publish on.
  // Saying it to a host whose listing is already live was simply wrong.
  const needsReview =
    !canSetVisibility && getSetting("listing_auto_publish", "false") !== "true";

  // If this host has a prior event, offer to prefill from it (unless this one is
  // already filled in). Pass a slim, serializable subset to the client form.
  const priorRow =
    !event.host_posted && !event.description
      ? findLastEventByHostEmail(event.host_email, event.id)
      : null;
  const lastEvent = priorRow
    ? {
        title: priorRow.title || "",
        description: priorRow.description || "",
        tickets: priorRow.tickets ?? "",
        price: priorRow.price || "",
        payment_instructions: priorRow.payment_instructions || "",
        payment_link: priorRow.payment_link || "",
        photo_path: priorRow.photo_path || "",
        pdf_paths: priorRow.pdf_paths || "[]",
        links: priorRow.links || "[]",
      }
    : null;

  async function save(data) {
    "use server";
    const autoPublish = getSetting("listing_auto_publish", "false") === "true";
    const existing = getEventByToken(params.token);
    // A listing past review keeps whatever visibility the host chose and never
    // re-enters the queue — nextListingStatus handles that, so only the real
    // auto-publish setting is passed here.
    const saved = saveHostListing(params.token, data, {
      submit: data.submit,
      autoPublish,
    });
    // Guest times outside the booked window are rejected — nothing was saved.
    if (saved?.error) return { ok: false, error: saved.error };
    // The host showing or hiding their own listing changes what the public sees
    // without the owner touching anything, so it's both logged and emailed.
    // Only a real visibility flip counts — an owner approval (pending → live)
    // isn't the host's doing and already happened in front of them.
    const flipped =
      saved &&
      saved.status !== existing?.status &&
      (saved.status === "private" || existing?.status === "private");
    if (flipped) {
      const isPublic = saved.status === "live";
      const actor = { actorUserId: null, actorName: existing.host_name || "Host" };
      logActivity({
        bookingId: existing.booking_id || null,
        eventType: "listing_visibility_changed",
        description: isPublic
          ? "Host put their listing back on the public calendar"
          : "Host hid their listing from the public calendar",
        ...actor,
      });
      // Never let a failed notification lose the host's save — it's already
      // committed by this point, and they'd have no idea why saving "failed".
      try {
        const res = await emailOwnerListingVisibility(saved, { isPublic });
        logEmail({
          bookingId: existing.booking_id || null,
          eventType: "owner_notified",
          description: isPublic
            ? `Owner notified — listing back on the calendar${saved.title ? ` · "${saved.title}"` : ""}`
            : `Owner notified — listing hidden${saved.title ? ` · "${saved.title}"` : ""}`,
          recipientEmail: recipientLabel(requestRecipients()),
          sendResult: res,
          ...actor,
        });
      } catch (err) {
        console.error("[host-listing] owner visibility notification failed:", err.message);
      }
    }
    // Activity: host listing submitted (a public-event host self-action). Only
    // log an actual submission, not autosaves/drafts.
    if (data.submit && existing?.booking_id) {
      logActivity({
        bookingId: existing.booking_id,
        eventType: "host_listing_submitted",
        description: `Host listing submitted${data.title ? ` · "${data.title}"` : ""}`,
        actorUserId: null,
        actorName: existing.host_name || "Host",
      });
    }
    revalidatePath("/events");
    revalidatePath("/calendar");
    revalidatePath("/admin/events");
    return { ok: true };
  }

  return (
    <main className="brandpage min-h-screen bg-paper-warm">
      <header className="border-b border-ink/10 bg-paper">
        <div className="container-content flex items-center justify-between py-4">
          <Link href="/" className="font-display text-xl font-semibold text-ink">
            The Alley <span className="text-brass-dark">On Center</span>
          </Link>
          <span className="text-sm text-ink-muted">Host event listing</span>
        </div>
      </header>

      <div className="container-content max-w-2xl py-10">
        <p className="eyebrow">Your private posting link</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-ink">
          {canSetVisibility ? "Your event listing" : "Post your event"}
        </h1>
        <p className="mt-2 text-ink-muted">
          {canSetVisibility ? (
            <>
              Change anything below and save — your edits go straight to The
              Alley&apos;s calendar, no waiting. Whether it shows publicly at all
              is up to you, down in &ldquo;Who can see this&rdquo;. Bookmark this
              link; it always brings you back here.
            </>
          ) : (
            <>
              Share your class with The Alley community. Fill in the details, add
              a flyer, and tell attendees how to pay you.
              {needsReview
                ? " We’ll do a quick review before it goes live."
                : " It goes on the calendar as soon as you post it."}{" "}
              Bookmark this link — you can come back and edit anytime.
            </>
          )}
        </p>

        <div className="mt-8">
          <HostListingForm event={event} saveAction={save} alreadyLive={alreadyLive} canSetVisibility={canSetVisibility} needsReview={needsReview} lastEvent={lastEvent} sessions={getEventSessions(event)} bookingWindow={getEventBookingWindow(event)} />
        </div>
      </div>
    </main>
  );
}

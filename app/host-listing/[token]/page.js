import Link from "next/link";
import { revalidatePath } from "next/cache";
import { getEventByToken, saveHostListing } from "@/lib/catalog.js";
import { getSetting } from "@/lib/db.js";
import { logActivity } from "@/lib/activity.js";
import HostListingForm from "@/components/HostListingForm.js";

export const metadata = { title: "Post your event" };

export default function HostListingPage({ params }) {
  const event = getEventByToken(params.token);

  if (!event) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-paper-warm px-5">
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

  async function save(data) {
    "use server";
    const autoPublish = getSetting("listing_auto_publish", "false") === "true";
    // If it's already live, keep it live on edit; otherwise route through review.
    const existing = getEventByToken(params.token);
    const wasLive = existing?.status === "live";
    saveHostListing(params.token, data, {
      submit: data.submit,
      autoPublish: autoPublish || wasLive,
    });
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
    <main className="min-h-screen bg-paper-warm">
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
          Post your event
        </h1>
        <p className="mt-2 text-ink-muted">
          Share your class with The Alley community. Fill in the details, add a
          flyer, and tell attendees how to pay you. We&apos;ll do a quick review
          before it goes live. Bookmark this link — you can come back and edit
          anytime.
        </p>

        <div className="mt-8">
          <HostListingForm event={event} saveAction={save} alreadyLive={alreadyLive} />
        </div>
      </div>
    </main>
  );
}

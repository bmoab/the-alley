import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  getDirectoryByToken,
  saveDirectoryListing,
  parseDirectoryLinks,
  parseDirectoryPhotos,
  directorySlug,
  listTenantEvents,
  createTenantEvent,
  updateTenantEvent,
  deleteTenantEvent,
} from "@/lib/catalog.js";
import { saveUpload } from "@/lib/uploads.js";
import { formatDate, formatTime, venueToday } from "@/lib/constants.js";
import DirectoryEditForm from "@/components/DirectoryEditForm.js";

export const metadata = { title: "Set up your business listing" };

// Per-token page: never cache one tenant's view and serve it to another.
export const dynamic = "force-dynamic";

/** An uploaded flyer, or null when they didn't pick one. */
async function savePhoto(file) {
  if (!file || typeof file === "string" || !file.size) return null;
  try {
    return await saveUpload(file, "image");
  } catch (err) {
    console.error("[business-listing] flyer upload failed:", err.message);
    return null;
  }
}

/**
 * Everywhere a tenant event can show up.
 *
 * ⚠️ Module scope on purpose. A server action closes over serializable values
 * only, so a helper declared inside the component is undefined by the time the
 * action runs on the server — and it fails AFTER the row is written, leaving a
 * created event with a stale page and no redirect.
 */
function refreshEvents(token) {
  revalidatePath("/calendar");
  revalidatePath("/events");
  revalidatePath("/");
  revalidatePath("/admin/events");
  revalidatePath(`/business-listing/${token}`);
}

function eventFieldsFrom(formData) {
  return {
    title: (formData.get("title") || "").toString(),
    date: (formData.get("date") || "").toString(),
    public_time: (formData.get("public_time") || "").toString(),
    public_end_time: (formData.get("public_end_time") || "").toString(),
    description: (formData.get("description") || "").toString(),
    price: (formData.get("price") || "").toString(),
    links: [{ label: (formData.get("link_label") || "").toString(), url: (formData.get("link_url") || "").toString() }],
  };
}

export default function BusinessListingPage({ params, searchParams }) {
  const entry = getDirectoryByToken(params.token);

  if (!entry) {
    return (
      <main className="brandpage flex min-h-screen items-center justify-center bg-paper-warm px-5">
        <div className="card max-w-md p-8 text-center">
          <h1 className="font-display text-2xl font-semibold text-ink">
            Link not found
          </h1>
          <p className="mt-3 text-ink-muted">
            This listing link is invalid or has expired. Check your email for the
            correct link, or contact The Alley.
          </p>
          <Link href="/" className="btn-primary mt-6">
            Visit The Alley
          </Link>
        </div>
      </main>
    );
  }

  async function save(data) {
    "use server";
    const saved = saveDirectoryListing(params.token, data);
    revalidatePath("/directory");
    revalidatePath("/admin/directory");
    if (saved) revalidatePath(`/directory/${directorySlug(saved)}`);
    return { ok: true };
  }

  async function addEvent(formData) {
    "use server";
    // Re-resolved from the URL TOKEN, never from a form field — the browser
    // doesn't get to say which business it is.
    const me = getDirectoryByToken(params.token);
    if (!me) redirect("/");
    const photo_path = await savePhoto(formData.get("photo"));
    const created = createTenantEvent(me.id, { ...eventFieldsFrom(formData), photo_path });
    refreshEvents(params.token);
    redirect(`/business-listing/${params.token}?ev=${created ? "added" : "error"}#events`);
  }

  async function editEvent(formData) {
    "use server";
    const me = getDirectoryByToken(params.token);
    if (!me) redirect("/");
    const photo_path = await savePhoto(formData.get("photo"));
    // The id comes from the browser, so updateTenantEvent scopes by tenant too.
    updateTenantEvent(me.id, formData.get("id"), { ...eventFieldsFrom(formData), photo_path });
    refreshEvents(params.token);
    redirect(`/business-listing/${params.token}?ev=saved#events`);
  }

  async function removeEvent(formData) {
    "use server";
    const me = getDirectoryByToken(params.token);
    if (!me) redirect("/");
    deleteTenantEvent(me.id, formData.get("id"));
    refreshEvents(params.token);
    redirect(`/business-listing/${params.token}?ev=removed#events`);
  }

  const today = venueToday();
  const events = listTenantEvents(entry.id);
  const upcoming = events.filter((e) => (e.date || "") >= today);
  const past = events.filter((e) => (e.date || "") < today).reverse();
  const notice = (searchParams?.ev || "").toString();
  const NOTICES = {
    added: "Added — it's on The Alley's calendar now.",
    saved: "Saved.",
    removed: "Removed from the calendar.",
    error: "That needs at least a title and a date.",
  };

  return (
    <main className="brandpage min-h-screen bg-paper-warm">
      <header className="border-b border-ink/10 bg-paper">
        <div className="container-content flex items-center justify-between py-4">
          <Link href="/" className="font-display text-xl font-semibold text-ink">
            The Alley <span className="text-brass-dark">On Center</span>
          </Link>
          <span className="text-sm text-ink-muted">Business listing</span>
        </div>
      </header>

      <div className="container-content max-w-2xl py-10">
        <p className="eyebrow">Your private listing link</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-ink">
          Set up your listing
        </h1>
        <p className="mt-2 text-ink-muted">
          This is your spot in The Alley directory. Add your details, photos, and
          links — your changes go live on our website right away. Bookmark this
          link to edit anytime.
        </p>

        <div className="mt-8">
          <DirectoryEditForm
            entry={{
              ...entry,
              links: parseDirectoryLinks(entry),
              photos: parseDirectoryPhotos(entry),
            }}
            saveAction={save}
          />
        </div>

        {/* ------------------------------------------------ tenant events */}
        <div id="events" className="mt-12 border-t border-ink/10 pt-10">
          <h2 className="font-display text-2xl font-semibold text-ink">
            Your events on The Alley calendar
          </h2>

          {/* The distinction Chelsea asked us to spell out. A tenant seeing a
              date field will reasonably assume they're reserving something. */}
          <div className="mt-4 rounded-xl border border-gold/40 bg-gold/10 p-5">
            <p className="font-semibold text-ink">This is a listing, not a booking.</p>
            <p className="mt-2 text-sm text-ink-soft">
              Posting here puts your event on The Alley&rsquo;s public calendar so
              visitors can see what&rsquo;s happening. It does <strong>not</strong> reserve
              any Alley space, and it doesn&rsquo;t stop anyone else booking that day.
            </p>
            <p className="mt-3 text-sm font-semibold text-ink">
              It&rsquo;s for things in your own space — for example:
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink-soft">
              <li>a book signing or author night</li>
              <li>Tattoo Tuesdays, or any regular evening you run</li>
              <li>a late opening, a sale, or a guest artist in for the day</li>
            </ul>
            <p className="mt-3 text-sm text-ink-soft">
              <strong className="text-ink">Need a room to yourself?</strong> The Loft,
              the Main Floor and the Conference Room are booked separately — send a{" "}
              <Link href="/book" className="font-semibold text-brass-dark hover:underline">
                booking request
              </Link>{" "}
              and we&rsquo;ll confirm the space is held for you.
            </p>
          </div>

          {notice && NOTICES[notice] ? (
            <p
              role="status"
              className={`mt-4 rounded-lg border px-4 py-2 text-sm ${
                notice === "error"
                  ? "border-rust/30 bg-rust/10 text-rust"
                  : "border-verde-deep/30 bg-verde/30 text-ink"
              }`}
            >
              {NOTICES[notice]}
            </p>
          ) : null}

          {upcoming.length ? (
            <div className="mt-6 space-y-3">
              {upcoming.map((ev) => (
                <details key={ev.id} className="card p-5">
                  <summary className="flex cursor-pointer items-center justify-between gap-3">
                    <span>
                      <span className="font-semibold text-ink">{ev.title}</span>
                      <span className="ml-2 text-sm text-ink-muted">
                        {ev.date ? formatDate(ev.date) : ""}
                        {ev.public_time ? ` · ${formatTime(ev.public_time)}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-ink-muted">edit ▾</span>
                  </summary>
                  <form action={editEvent} className="mt-4 grid gap-3">
                    <input type="hidden" name="id" value={ev.id} />
                    <EventFields ev={ev} />
                    <div className="flex flex-wrap items-center gap-3">
                      <button type="submit" className="btn-accent">Save changes</button>
                    </div>
                  </form>
                  <form action={removeEvent} className="mt-3 border-t border-ink/10 pt-3">
                    <input type="hidden" name="id" value={ev.id} />
                    <button type="submit" className="text-sm font-semibold text-rust hover:underline">
                      Remove from the calendar
                    </button>
                  </form>
                </details>
              ))}
            </div>
          ) : (
            <p className="mt-6 text-sm text-ink-muted">
              You haven&rsquo;t posted any events yet.
            </p>
          )}

          <details className="card mt-4 p-5" open={!upcoming.length}>
            <summary className="cursor-pointer font-semibold text-ink">+ Add an event</summary>
            <form action={addEvent} className="mt-4 grid gap-3">
              <EventFields />
              <button type="submit" className="btn-accent w-fit">
                Add to the calendar
              </button>
            </form>
          </details>

          {past.length ? (
            <details className="mt-6">
              <summary className="cursor-pointer text-sm font-semibold text-ink-soft hover:text-ink">
                Past events ({past.length})
              </summary>
              <ul className="mt-3 space-y-2">
                {past.map((ev) => (
                  <li
                    key={ev.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-paper px-4 py-2 text-sm"
                  >
                    <span className="text-ink-soft">
                      {ev.title} · {ev.date ? formatDate(ev.date) : ""}
                    </span>
                    <form action={removeEvent}>
                      <input type="hidden" name="id" value={ev.id} />
                      <button type="submit" className="text-xs font-semibold text-rust hover:underline">
                        Remove
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      </div>
    </main>
  );
}

/** The shared field set, used by both the add form and each edit form. */
function EventFields({ ev = null }) {
  const link = (() => {
    try {
      const l = JSON.parse(ev?.links || "[]");
      return Array.isArray(l) && l[0] ? l[0] : { label: "", url: "" };
    } catch {
      return { label: "", url: "" };
    }
  })();
  return (
    <>
      <div>
        <label className="label">Event name</label>
        <input
          name="title"
          required
          defaultValue={ev?.title || ""}
          placeholder="Book signing with Abigail Morgan"
          className="field"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label">Date</label>
          <input type="date" name="date" required defaultValue={ev?.date || ""} className="field" />
        </div>
        <div>
          <label className="label">Starts</label>
          <input type="time" name="public_time" defaultValue={ev?.public_time || ""} className="field" />
        </div>
        <div>
          <label className="label">Ends (optional)</label>
          <input type="time" name="public_end_time" defaultValue={ev?.public_end_time || ""} className="field" />
        </div>
      </div>
      <div>
        <label className="label">What is it?</label>
        <textarea
          name="description"
          rows={3}
          defaultValue={ev?.description || ""}
          placeholder="Abigail's signing copies of the anniversary edition from 6pm — first come, first served."
          className="field"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Cost (optional)</label>
          <input name="price" defaultValue={ev?.price || ""} placeholder="Free · $10 · $25" className="field" />
        </div>
        <div>
          <label className="label">Flyer or photo (optional)</label>
          <input type="file" name="photo" accept="image/*" className="block w-full text-sm" />
          {ev?.photo_path ? (
            <p className="mt-1 text-xs text-ink-muted">
              A flyer is already attached — choosing a new one replaces it.
            </p>
          ) : null}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Link label (optional)</label>
          <input name="link_label" defaultValue={link.label || ""} placeholder="Reserve a copy" className="field" />
        </div>
        <div>
          <label className="label">Link (optional)</label>
          <input name="link_url" defaultValue={link.url || ""} placeholder="yourshop.com/events" className="field" />
        </div>
      </div>
    </>
  );
}

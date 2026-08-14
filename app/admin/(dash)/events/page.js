import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  listAllEvents,
  setEventStatus,
  updateEvent,
  deleteEvent,
  createOwnEvent,
  createHostInvite,
  getEvent,
  parseEventLinks,
  eventLastDate,
} from "@/lib/catalog.js";
import LinksEditor from "@/components/LinksEditor.js";
import EventMediaField from "@/components/admin/EventMediaField.js";
import { emailHostInvite, emailHostReminder } from "@/lib/email.js";
import { logEmail } from "@/lib/activity.js";
import { getActor } from "@/lib/auth.js";
import { SPACES, spaceName, formatDate, formatTime, venueToday } from "@/lib/constants.js";
import { eventTimeLabel } from "@/lib/event-time.js";
import { db } from "@/lib/db.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import Button from "@/components/admin/ui/Button.js";
import { cx } from "@/components/admin/ui/cx.js";

export const metadata = { title: "Public Events" };

const APP_URL = process.env.APP_URL || "";

function invitedRedirect(hasEmail, id) {
  if (hasEmail) {
    redirect(
      "/admin/events?toast=" +
        encodeURIComponent("Invite link emailed to the host.") +
        "&toastType=success#ev-" + id
    );
  }
  redirect(
    "/admin/events?toast=" +
      encodeURIComponent(
        "No host email entered — copy the link from “Awaiting host details” below and send it manually."
      ) +
      "&toastType=error#ev-" + id
  );
}

function refresh() {
  revalidatePath("/admin/events");
  revalidatePath("/events");
  revalidatePath("/calendar");
  revalidatePath("/");
}

// Owner invites a host directly: minimal details now, host fills the rest.
async function inviteHost(formData) {
  "use server";
  const host_name = (formData.get("host_name") || "").toString().trim();
  const host_email = (formData.get("host_email") || "").toString().trim();
  if (!host_name) redirect("/admin/events");
  const { id, token } = createHostInvite({
    host_name,
    host_email,
    title: (formData.get("title") || "").toString().trim(),
    date: (formData.get("date") || "").toString().trim(),
    active_until: (formData.get("active_until") || "").toString().trim(),
  });
  if (host_email) {
    try {
      await emailHostInvite({ client_name: host_name, client_email: host_email }, token);
    } catch (err) {
      console.error("[events] host invite email error:", err.message);
    }
  }
  refresh();
  invitedRedirect(!!host_email, id);
}

// Re-send / reveal a draft host's invite link.
async function emailHostLink(formData) {
  "use server";
  const id = Number(formData.get("id"));
  const ev = getEvent(id);
  if (ev?.host_email && ev?.host_token) {
    try {
      await emailHostInvite({ client_name: ev.host_name, client_email: ev.host_email }, ev.host_token);
    } catch (err) {
      console.error("[events] host invite email error:", err.message);
    }
  }
  refresh();
  invitedRedirect(!!ev?.host_email, id);
}

// Nudge a host whose listing is live as a placeholder but still empty.
async function remindHost(formData) {
  "use server";
  const id = Number(formData.get("id"));
  const ev = getEvent(id);
  let ok = false;
  if (ev?.host_email && ev?.host_token) {
    try {
      const res = await emailHostReminder(ev);
      // Reset the auto-reminder clock so the cron doesn't double-nudge within
      // its ~3-day window right after a manual reminder.
      db.prepare("UPDATE events SET host_reminder_last_sent = ? WHERE id = ?").run(venueToday(), id);
      // Record the nudge so there's a trail of who was reminded and when.
      // Booking-tied listings attach to their booking's activity; manual
      // invites (no booking) still land in the global activity feed.
      logEmail({
        bookingId: ev.booking_id || null,
        eventType: "host_reminder_sent",
        description: `Host-details reminder sent${ev.title ? ` · ${ev.title}` : ""}`,
        recipientEmail: ev.host_email,
        sendResult: res,
        ...(await getActor()),
      });
      ok = true;
    } catch (err) {
      console.error("[events] host reminder email error:", err.message);
    }
  }
  refresh();
  redirect(
    "/admin/events?toast=" +
      encodeURIComponent(
        ok
          ? `Reminder sent to ${ev.host_email}.`
          : ev?.host_token
            ? "No host email on file — copy their link and send it manually."
            : "Couldn't send the reminder."
      ) +
      "&toastType=" + (ok ? "success" : "neutral")
  );
}

async function approveEvent(formData) {
  "use server";
  setEventStatus(Number(formData.get("id")), "live");
  refresh();
  redirect("/admin/events");
}

async function unpublishEvent(formData) {
  "use server";
  setEventStatus(Number(formData.get("id")), "pending");
  refresh();
  redirect("/admin/events");
}

async function removeEvent(formData) {
  "use server";
  deleteEvent(Number(formData.get("id")));
  refresh();
  redirect("/admin/events");
}

function parseLinksField(formData) {
  try {
    const l = JSON.parse(formData.get("links") || "[]");
    return Array.isArray(l) ? l : [];
  } catch {
    return [];
  }
}

/** Uploaded PDF paths, posted by EventMediaField as a JSON array. */
function parsePdfsField(formData) {
  try {
    const p = JSON.parse(formData.get("pdf_paths") || "[]");
    return Array.isArray(p) ? p.filter((x) => typeof x === "string" && x) : [];
  } catch {
    return [];
  }
}

async function saveEvent(formData) {
  "use server";
  const id = Number(formData.get("id"));
  updateEvent(id, {
    title: formData.get("title"),
    host_name: formData.get("host_name"),
    description: formData.get("description"),
    date: formData.get("date"),
    time: formData.get("time"),
    // Guest-facing times; blank clears back to the reservation time.
    public_time: (formData.get("public_time") || "").toString(),
    public_end_time: (formData.get("public_end_time") || "").toString(),
    tickets: formData.get("tickets") || null,
    price: formData.get("price"),
    payment_instructions: formData.get("payment_instructions"),
    payment_link: formData.get("payment_link"),
    links: parseLinksField(formData),
    // "" is an explicit "remove the photo", not "leave it alone".
    photo_path: (formData.get("photo_path") ?? "").toString(),
    pdf_paths: parsePdfsField(formData),
  });
  refresh();
  redirect("/admin/events");
}

async function createEvent(formData) {
  "use server";
  const created = createOwnEvent({
    title: formData.get("title"),
    host_name: formData.get("host_name") || "The Alley On Center",
    description: formData.get("description"),
    date: formData.get("date"),
    time: formData.get("time"),
    public_time: (formData.get("public_time") || "").toString(),
    public_end_time: (formData.get("public_end_time") || "").toString(),
    space: formData.get("space") || null,
    tickets: formData.get("tickets") || null,
    price: formData.get("price"),
    payment_instructions: formData.get("payment_instructions"),
    payment_link: formData.get("payment_link"),
    photo_path: (formData.get("photo_path") || "").toString() || null,
    pdf_paths: parsePdfsField(formData),
    links: parseLinksField(formData),
    status: "live",
  });
  refresh();
  // Redirecting to the bare "/admin/events" was a no-op: that's the page the
  // form is already on, so nothing visibly happened, no confirmation appeared,
  // and the form kept its values — pressing "Publish event" again just created
  // another copy. Carrying the new id + a toast makes it a real navigation, so
  // the owner gets feedback and the form below resets (it's keyed on ?ev=).
  redirect(
    `/admin/events?ev=${created.id}&toast=` +
      encodeURIComponent(`"${created.title || "Event"}" is live on the calendar.`) +
      "&toastType=success"
  );
}

/** An event's stored pdf_paths JSON → array (tolerates null / bad JSON). */
function parsePdfPaths(ev) {
  try {
    const p = JSON.parse(ev.pdf_paths || "[]");
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

function EventEditor({ ev }) {
  return (
    <form action={saveEvent} className="mt-3 grid gap-3 border-t border-line pt-3">
      <input type="hidden" name="id" value={ev.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label">Title</label><input name="title" defaultValue={ev.title || ""} className="field" /></div>
        <div><label className="label">Host name</label><input name="host_name" defaultValue={ev.host_name || ""} className="field" /></div>
      </div>
      <div><label className="label">Description</label><textarea name="description" rows={3} defaultValue={ev.description || ""} className="field" /></div>
      <div className="grid gap-3 sm:grid-cols-4">
        <div><label className="label">Date</label><input type="date" name="date" defaultValue={ev.date || ""} className="field" /></div>
        <div><label className="label">Booking time</label><input type="time" name="time" defaultValue={ev.time || ""} className="field" /></div>
        <div><label className="label">Spots</label><input type="number" name="tickets" defaultValue={ev.tickets ?? ""} className="field" /></div>
        <div><label className="label">Price</label><input name="price" defaultValue={ev.price || ""} className="field" /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label">Guests arrive at</label><input type="time" name="public_time" defaultValue={ev.public_time || ""} className="field" /></div>
        <div><label className="label">Ends at</label><input type="time" name="public_end_time" defaultValue={ev.public_end_time || ""} className="field" /></div>
      </div>
      <p className="-mt-1 text-xs text-ink-muted">
        What the public calendar shows. Hosts often book early to set up — set these
        so guests see the real event time. Blank falls back to the booking time.
        Changing them never moves the reservation.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label">Payment instructions</label><input name="payment_instructions" defaultValue={ev.payment_instructions || ""} className="field" /></div>
        <div><label className="label">Payment link</label><input name="payment_link" defaultValue={ev.payment_link || ""} className="field" /></div>
      </div>
      <div>
        <label className="label">Links (buttons on the public listing)</label>
        <LinksEditor name="links" value={parseEventLinks(ev)} />
      </div>
      <EventMediaField photo={ev.photo_path || ""} pdfs={parsePdfPaths(ev)} />
      <Button type="submit" className="w-fit">Save changes</Button>
    </form>
  );
}

function EventCard({ ev, children, focused = false }) {
  // A live listing with a host link the host hasn't filled in yet — on the
  // calendar as a title-only placeholder.
  const placeholder = ev.status === "live" && ev.host_token && !ev.host_posted;
  return (
    // The id is what the calendar's #ev-<id> link scrolls to; arriving from the
    // calendar also opens the card and rings it, so it's clear which one it is.
    <details
      id={`ev-${ev.id}`}
      open={focused}
      className={cx("card p-5", focused && "ring-2 ring-verde-deep")}
    >
      <summary className="flex cursor-pointer items-center justify-between gap-3">
        <span>
          <span className="font-semibold text-ink">{ev.title || "(untitled)"}</span>
          {placeholder ? (
            <span className="ml-2 rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-soft">
              Placeholder · host hasn’t posted
            </span>
          ) : null}
          <span className="ml-2 text-xs text-ink-muted">
            {ev.host_name ? `${ev.host_name} · ` : ""}
            {ev.date ? formatDate(ev.date) : "no date"}
            {/* Show what the public sees, not the reservation start. */}
            {eventTimeLabel(ev) ? ` · ${eventTimeLabel(ev)}` : ""}
            {ev.space ? ` · ${spaceName(ev.space)}` : ""}
          </span>
        </span>
        <span className="shrink-0 text-xs text-ink-muted">edit ▾</span>
      </summary>
      <EventEditor ev={ev} />
      {ev.host_token ? (
        <div className="mt-3 border-t border-line pt-3">
          <p className="text-xs font-semibold text-ink">Host self-edit link</p>
          <p className="mt-1 text-xs text-ink-muted">
            The host&apos;s private link to manage their own listing (title, description, photo, payment). Open it to
            edit on their behalf, or re-send it.
          </p>
          <input readOnly value={`${APP_URL}/host-listing/${ev.host_token}`} className="field mt-2 text-xs" />
          <div className="mt-2 flex flex-wrap gap-2">
            <form action={emailHostLink}>
              <input type="hidden" name="id" value={ev.id} />
              <Button type="submit" variant="ghost" size="sm">
                {ev.host_email ? `Email link to ${ev.host_email}` : "No host email on file"}
              </Button>
            </form>
            {placeholder && ev.host_email ? (
              <form action={remindHost}>
                <input type="hidden" name="id" value={ev.id} />
                <Button type="submit" variant="subtle" size="sm">Remind host to finish</Button>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-3 border-t border-line pt-3">{children}</div>
    </details>
  );
}

export default function EventsAdminPage({ searchParams }) {
  // ?ev=<id> — arrived from the admin calendar; open + highlight that listing.
  const focusedEv = (searchParams?.ev || "").toString();
  const all = listAllEvents();
  // A listing is done only once its LAST date has passed — a weekly series
  // whose first session already happened is still current. Undated invites are
  // never "past". Finished listings move to their own collapsed section so this
  // list stays about what's coming up; the admin calendar still shows history.
  const today = venueToday();
  const isPast = (e) => {
    const last = eventLastDate(e);
    return Boolean(last) && last < today;
  };
  const pending = all.filter((e) => e.status === "pending");
  const live = all.filter((e) => e.status === "live" && !isPast(e));
  const past = all.filter((e) => e.status === "live" && isPast(e)).reverse();
  const drafts = all.filter((e) => e.status === "draft");

  return (
    <div>
      <PageHeader
        title="Public Events"
        subtitle="Invite a host with just their name and email — they fill in their own event details. Then review and publish submissions here. You can also post The Alley's own events."
      />

      {/* Invite a host */}
      <details className="card p-5" open={drafts.length === 0 && pending.length === 0 && live.length === 0}>
        <summary className="cursor-pointer font-semibold text-ink">+ Invite a host to post an event</summary>
        <form action={inviteHost} className="mt-4 grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label">Host name</label><input name="host_name" required placeholder="Jane Maker" className="field" /></div>
            <div><label className="label">Host email (sends them the link)</label><input name="host_email" type="email" placeholder="host@email.com" className="field" /></div>
          </div>
          <div>
            <label className="label">Event title (optional)</label>
            <input name="title" placeholder="e.g. Saturday Improv Night" className="field" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label">Event date (optional)</label><input name="date" type="date" className="field" /></div>
            <div><label className="label">Through (optional, multi-day)</label><input name="active_until" type="date" className="field" /></div>
          </div>
          <p className="text-xs text-ink-muted">
            With a date, the title goes on the public calendar right away as a placeholder — the host then
            adds their photo, description, and how attendees pay them via their private link.
          </p>
          <Button type="submit" className="w-fit">Send host invite</Button>
        </form>
      </details>

      {/* Awaiting review */}
      <h2 className="mt-8 text-xl font-semibold text-ink">
        Awaiting review {pending.length ? <span className="text-verde-deep">({pending.length})</span> : null}
      </h2>
      {pending.length === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">Nothing waiting for review.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {pending.map((ev) => (
            <EventCard key={ev.id} ev={ev} focused={String(ev.id) === focusedEv}>
              <form action={approveEvent}><input type="hidden" name="id" value={ev.id} /><Button type="submit" variant="accent" size="sm">Approve &amp; publish</Button></form>
              <form action={removeEvent}><input type="hidden" name="id" value={ev.id} /><button className="text-sm font-semibold text-rust hover:underline">Remove</button></form>
            </EventCard>
          ))}
        </div>
      )}

      {/* Live */}
      <h2 className="mt-8 text-xl font-semibold text-ink">
        Live on the calendar {live.length ? <span className="text-verde-deep">({live.length})</span> : null}
      </h2>
      {live.length === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">No live events yet.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {live.map((ev) => (
            <EventCard key={ev.id} ev={ev} focused={String(ev.id) === focusedEv}>
              <form action={unpublishEvent}><input type="hidden" name="id" value={ev.id} /><Button type="submit" variant="ghost" size="sm">Unpublish</Button></form>
              <form action={removeEvent}><input type="hidden" name="id" value={ev.id} /><button className="text-sm font-semibold text-rust hover:underline">Remove</button></form>
            </EventCard>
          ))}
        </div>
      )}

      {/* Past — still editable, just out of the way. */}
      {past.length ? (
        // Opens when the calendar linked straight to a past listing, otherwise
        // that #ev-<id> jump would land on a collapsed section.
        <details className="mt-6" open={past.some((e) => String(e.id) === focusedEv)}>
          <summary className="cursor-pointer text-sm font-semibold text-ink-soft hover:text-ink">
            Past events ({past.length})
          </summary>
          <p className="mt-2 text-sm text-ink-muted">
            Already happened, so they&apos;re off the public calendar — still here if you
            need to reuse or remove one.
          </p>
          <div className="mt-3 space-y-3">
            {past.map((ev) => (
              <EventCard key={ev.id} ev={ev} focused={String(ev.id) === focusedEv}>
                <form action={unpublishEvent}><input type="hidden" name="id" value={ev.id} /><Button type="submit" variant="ghost" size="sm">Unpublish</Button></form>
                <form action={removeEvent}><input type="hidden" name="id" value={ev.id} /><button className="text-sm font-semibold text-rust hover:underline">Remove</button></form>
              </EventCard>
            ))}
          </div>
        </details>
      ) : null}

      {/* Drafts (host invited, not yet submitted) */}
      {drafts.length ? (
        <>
          <h2 className="mt-8 text-xl font-semibold text-ink">
            Awaiting host details <span className="text-ink-muted">({drafts.length})</span>
          </h2>
          <div className="mt-3 space-y-2">
            {drafts.map((ev) => (
              <div
                key={ev.id}
                id={`ev-${ev.id}`}
                className={cx(
                  "card p-4 text-sm",
                  String(ev.id) === focusedEv && "ring-2 ring-verde-deep"
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-ink-soft">
                    <strong>{ev.host_name || "(host)"}</strong>
                    {ev.date ? ` — ${formatDate(ev.date)}` : ""}
                    {ev.space ? ` · ${spaceName(ev.space)}` : ""}
                  </span>
                  <span className="shrink-0 text-xs text-ink-muted">Invite sent · not posted yet</span>
                </div>
                {ev.host_token ? (
                  <div className="mt-2">
                    <input readOnly value={`${APP_URL}/host-listing/${ev.host_token}`} className="field text-xs" />
                    <div className="mt-2 flex flex-wrap gap-3">
                      <form action={emailHostLink}>
                        <input type="hidden" name="id" value={ev.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          {ev.host_email ? `Email link to ${ev.host_email}` : "No email on file"}
                        </Button>
                      </form>
                      <form action={removeEvent}>
                        <input type="hidden" name="id" value={ev.id} />
                        <button className="text-sm font-semibold text-rust hover:underline">Cancel invite</button>
                      </form>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </>
      ) : null}

      {/* Create own event */}
      <h2 className="mt-10 text-xl font-semibold text-ink">
        Create an Alley event
      </h2>
      {/* Keyed on the last-created id so a successful publish REMOUNTS this
          block: the <details> collapses and every field clears. Without the
          key, React reconciles the same DOM nodes and the just-submitted values
          sit there looking like the publish didn't take. */}
      <details className="mt-3 card p-5" key={`new-event-${focusedEv || "blank"}`}>
        <summary className="cursor-pointer font-semibold text-ink">+ New event</summary>
        <form action={createEvent} className="mt-4 grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label">Title</label><input name="title" required className="field" /></div>
            <div><label className="label">Host name</label><input name="host_name" defaultValue="The Alley On Center" className="field" /></div>
          </div>
          <div><label className="label">Description</label><textarea name="description" rows={3} className="field" /></div>
          <div className="grid gap-3 sm:grid-cols-4">
            <div><label className="label">Date</label><input type="date" name="date" required className="field" /></div>
            <div><label className="label">Time</label><input type="time" name="time" className="field" /></div>
            <div>
              <label className="label">Space</label>
              <select name="space" className="field">
                <option value="">—</option>
                {SPACES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div><label className="label">Spots</label><input type="number" name="tickets" className="field" /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label">Guests arrive at (optional)</label><input type="time" name="public_time" className="field" /></div>
            <div><label className="label">Ends at (optional)</label><input type="time" name="public_end_time" className="field" /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><label className="label">Price</label><input name="price" className="field" /></div>
            <div><label className="label">Payment instructions</label><input name="payment_instructions" className="field" /></div>
            <div><label className="label">Payment link</label><input name="payment_link" className="field" /></div>
          </div>
          <div>
            <label className="label">Links (buttons on the public listing)</label>
            <LinksEditor name="links" value={[]} />
          </div>
          <EventMediaField />
          <Button type="submit" className="w-fit">Publish event</Button>
        </form>
      </details>
    </div>
  );
}

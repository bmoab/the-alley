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
} from "@/lib/catalog.js";
import { emailHostInvite } from "@/lib/email.js";
import { SPACES, spaceName, formatDate, formatTime } from "@/lib/constants.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import Button from "@/components/admin/ui/Button.js";

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

async function saveEvent(formData) {
  "use server";
  const id = Number(formData.get("id"));
  updateEvent(id, {
    title: formData.get("title"),
    host_name: formData.get("host_name"),
    description: formData.get("description"),
    date: formData.get("date"),
    time: formData.get("time"),
    tickets: formData.get("tickets") || null,
    price: formData.get("price"),
    payment_instructions: formData.get("payment_instructions"),
    payment_link: formData.get("payment_link"),
  });
  refresh();
  redirect("/admin/events");
}

async function createEvent(formData) {
  "use server";
  createOwnEvent({
    title: formData.get("title"),
    host_name: formData.get("host_name") || "The Alley On Center",
    description: formData.get("description"),
    date: formData.get("date"),
    time: formData.get("time"),
    space: formData.get("space") || null,
    tickets: formData.get("tickets") || null,
    price: formData.get("price"),
    payment_instructions: formData.get("payment_instructions"),
    payment_link: formData.get("payment_link"),
    status: "live",
  });
  refresh();
  redirect("/admin/events");
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
        <div><label className="label">Time</label><input type="time" name="time" defaultValue={ev.time || ""} className="field" /></div>
        <div><label className="label">Spots</label><input type="number" name="tickets" defaultValue={ev.tickets ?? ""} className="field" /></div>
        <div><label className="label">Price</label><input name="price" defaultValue={ev.price || ""} className="field" /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label">Payment instructions</label><input name="payment_instructions" defaultValue={ev.payment_instructions || ""} className="field" /></div>
        <div><label className="label">Payment link</label><input name="payment_link" defaultValue={ev.payment_link || ""} className="field" /></div>
      </div>
      <Button type="submit" className="w-fit">Save changes</Button>
    </form>
  );
}

function EventCard({ ev, children }) {
  return (
    <details className="card p-5">
      <summary className="flex cursor-pointer items-center justify-between gap-3">
        <span>
          <span className="font-semibold text-ink">{ev.title || "(untitled)"}</span>
          <span className="ml-2 text-xs text-ink-muted">
            {ev.host_name ? `${ev.host_name} · ` : ""}
            {ev.date ? formatDate(ev.date) : "no date"}
            {ev.time ? ` · ${formatTime(ev.time)}` : ""}
            {ev.space ? ` · ${spaceName(ev.space)}` : ""}
          </span>
        </span>
        <span className="shrink-0 text-xs text-ink-muted">edit ▾</span>
      </summary>
      <EventEditor ev={ev} />
      <div className="mt-3 flex flex-wrap gap-3 border-t border-line pt-3">{children}</div>
    </details>
  );
}

export default function EventsAdminPage() {
  const all = listAllEvents();
  const pending = all.filter((e) => e.status === "pending");
  const live = all.filter((e) => e.status === "live");
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
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label">Event date (optional)</label><input name="date" type="date" className="field" /></div>
            <div><label className="label">Through (optional, multi-day)</label><input name="active_until" type="date" className="field" /></div>
          </div>
          <p className="text-xs text-ink-muted">
            The host gets a private link to add the title, description, photo/flyer, and how attendees pay them.
            Their submission comes back here for your review.
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
            <EventCard key={ev.id} ev={ev}>
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
            <EventCard key={ev.id} ev={ev}>
              <form action={unpublishEvent}><input type="hidden" name="id" value={ev.id} /><Button type="submit" variant="ghost" size="sm">Unpublish</Button></form>
              <form action={removeEvent}><input type="hidden" name="id" value={ev.id} /><button className="text-sm font-semibold text-rust hover:underline">Remove</button></form>
            </EventCard>
          ))}
        </div>
      )}

      {/* Drafts (host invited, not yet submitted) */}
      {drafts.length ? (
        <>
          <h2 className="mt-8 text-xl font-semibold text-ink">
            Awaiting host details <span className="text-ink-muted">({drafts.length})</span>
          </h2>
          <div className="mt-3 space-y-2">
            {drafts.map((ev) => (
              <div key={ev.id} id={`ev-${ev.id}`} className="card p-4 text-sm">
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
      <details className="mt-3 card p-5">
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
          <div className="grid gap-3 sm:grid-cols-3">
            <div><label className="label">Price</label><input name="price" className="field" /></div>
            <div><label className="label">Payment instructions</label><input name="payment_instructions" className="field" /></div>
            <div><label className="label">Payment link</label><input name="payment_link" className="field" /></div>
          </div>
          <Button type="submit" className="w-fit">Publish event</Button>
        </form>
      </details>
    </div>
  );
}

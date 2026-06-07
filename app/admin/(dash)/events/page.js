import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  listAllEvents,
  setEventStatus,
  updateEvent,
  deleteEvent,
  createOwnEvent,
} from "@/lib/catalog.js";
import { SPACES, spaceName, formatDate, formatTime } from "@/lib/constants.js";

export const metadata = { title: "Public Events" };

function refresh() {
  revalidatePath("/admin/events");
  revalidatePath("/events");
  revalidatePath("/");
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
    <form action={saveEvent} className="mt-3 grid gap-3 border-t border-ink/10 pt-3">
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
      <button className="btn-primary w-fit">Save changes</button>
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
      <div className="mt-3 flex flex-wrap gap-3 border-t border-ink/10 pt-3">{children}</div>
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
      <p className="eyebrow">Admin</p>
      <h1 className="font-display text-3xl font-semibold text-ink">Public Events</h1>
      <p className="mt-1 text-ink-muted">
        Review host submissions, manage live listings, and post The Alley&apos;s
        own events.
      </p>

      {/* Awaiting review */}
      <h2 className="mt-8 font-display text-xl font-semibold text-ink">
        Awaiting review {pending.length ? <span className="text-brass-dark">({pending.length})</span> : null}
      </h2>
      {pending.length === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">Nothing waiting for review.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {pending.map((ev) => (
            <EventCard key={ev.id} ev={ev}>
              <form action={approveEvent}><input type="hidden" name="id" value={ev.id} /><button className="btn-accent !px-4 !py-1.5 text-sm">Approve &amp; publish</button></form>
              <form action={removeEvent}><input type="hidden" name="id" value={ev.id} /><button className="text-sm font-semibold text-rust hover:underline">Remove</button></form>
            </EventCard>
          ))}
        </div>
      )}

      {/* Live */}
      <h2 className="mt-8 font-display text-xl font-semibold text-ink">
        Live on the calendar {live.length ? <span className="text-brass-dark">({live.length})</span> : null}
      </h2>
      {live.length === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">No live events yet.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {live.map((ev) => (
            <EventCard key={ev.id} ev={ev}>
              <form action={unpublishEvent}><input type="hidden" name="id" value={ev.id} /><button className="btn-ghost !px-4 !py-1.5 text-sm">Unpublish</button></form>
              <form action={removeEvent}><input type="hidden" name="id" value={ev.id} /><button className="text-sm font-semibold text-rust hover:underline">Remove</button></form>
            </EventCard>
          ))}
        </div>
      )}

      {/* Drafts (host invited, not yet submitted) */}
      {drafts.length ? (
        <>
          <h2 className="mt-8 font-display text-xl font-semibold text-ink">
            Awaiting host details <span className="text-ink-muted">({drafts.length})</span>
          </h2>
          <div className="mt-3 space-y-2">
            {drafts.map((ev) => (
              <div key={ev.id} className="card flex items-center justify-between p-4 text-sm">
                <span className="text-ink-soft">
                  <strong>{ev.host_name}</strong> — {ev.date ? formatDate(ev.date) : ""} ·{" "}
                  {spaceName(ev.space)}
                </span>
                <span className="text-xs text-ink-muted">Invite sent · host hasn&apos;t posted yet</span>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {/* Create own event */}
      <h2 className="mt-10 font-display text-xl font-semibold text-ink">
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
          <button className="btn-primary w-fit">Publish event</button>
        </form>
      </details>
    </div>
  );
}

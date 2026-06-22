import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import AdminCalendar from "@/components/AdminCalendar.js";
import { listBookings } from "@/lib/bookings.js";
import { listLiveEvents } from "@/lib/catalog.js";
import { listClosures, createClosure, deleteClosure } from "@/lib/closures.js";
import { SPACES, spaceName, formatDate, formatTime } from "@/lib/constants.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import Card from "@/components/admin/ui/Card.js";
import Button from "@/components/admin/ui/Button.js";

export const metadata = { title: "Calendar" };
export const dynamic = "force-dynamic";

function refreshClosures() {
  revalidatePath("/admin/calendar");
  revalidatePath("/spaces");
  revalidatePath("/book");
}

async function addClosure(formData) {
  "use server";
  const allDay = formData.get("all_day") != null;
  createClosure({
    space: (formData.get("space") || "all").toString(),
    start_date: (formData.get("start_date") || "").toString(),
    end_date: (formData.get("end_date") || "").toString(),
    start_time: allDay ? null : (formData.get("start_time") || "").toString() || null,
    end_time: allDay ? null : (formData.get("end_time") || "").toString() || null,
    reason: (formData.get("reason") || "").toString(),
  });
  refreshClosures();
  redirect("/admin/calendar#closures");
}

async function removeClosure(formData) {
  "use server";
  deleteClosure(Number(formData.get("id")));
  refreshClosures();
  redirect("/admin/calendar#closures");
}

const SPACE_LABEL = { all: "Whole building", loft: "The Loft", main: "The Main Floor" };

export default function CalendarPage() {
  const held = listBookings({ status: "held" });
  const confirmed = listBookings({ status: "confirmed" });
  const cancelled = listBookings({ status: "cancelled" });
  const events = listLiveEvents();
  const closures = listClosures();
  // Full-day closures → calendar markers (date → labels).
  const closedDates = {};
  for (const c of closures) {
    if (c.start_time && c.end_time) continue; // partial closures aren't day markers
    let d = c.start_date;
    while (d <= c.end_date) {
      (closedDates[d] ||= []).push(SPACE_LABEL[c.space] || c.space);
      // advance one day
      const dt = new Date(d + "T00:00:00");
      dt.setDate(dt.getDate() + 1);
      d = dt.toISOString().slice(0, 10);
    }
  }

  const bookingItems = [...held, ...confirmed].map((b) => ({
    id: b.id,
    date: b.date,
    time: b.start_time,
    kind: b.space === "loft" ? "loft" : "main",
    title: b.client_name || spaceName(b.space),
    meta: `${b.status} · ${b.hours}h${b.event_type ? ` · ${b.event_type}` : ""}`,
    href: `/admin/bookings?focus=${b.id}#b-${b.id}`,
  }));

  const eventItems = events.map((e) => ({
    id: e.id,
    date: e.date,
    time: e.time,
    kind: "event",
    title: e.title || "Public event",
    meta: e.host_name ? `Hosted by ${e.host_name}` : "",
    href: `/admin/events#ev-${e.id}`,
  }));

  // Cancelled bookings stay visible (greyed) for the record, but no longer
  // block the slot — they're not in held/confirmed above.
  const cancelledItems = cancelled.map((b) => ({
    id: b.id,
    date: b.date,
    time: b.start_time,
    kind: "cancelled",
    title: `${b.client_name || spaceName(b.space)} (cancelled)`,
    meta: `${spaceName(b.space)} · cancelled`,
    href: `/admin/all-requests?status=cancelled`,
  }));

  const items = [...bookingItems, ...eventItems, ...cancelledItems];

  return (
    <div>
      <PageHeader
        title="Calendar"
        subtitle="Held and confirmed bookings plus live public events, color-coded by space."
      />

      <div className="mb-6 rounded-xl border border-verde-deep/25 bg-verde/40 p-4 text-sm">
        <p className="font-semibold text-ink">Sync to Google Calendar &amp; Skylight</p>
        <p className="mt-1 text-ink-soft">
          Subscribe any calendar to this live feed of your public events (Google Calendar → Other calendars →
          From URL; Skylight → Add calendar → iCal/URL):
        </p>
        <code className="mt-2 block break-all rounded bg-paper p-2 text-xs text-ink-soft">
          {(process.env.APP_URL || "") + "/calendar.ics"}
        </code>
        <p className="mt-2 text-xs text-ink-muted">
          Once it&apos;s in Google Calendar, share that calendar with your tenants. Set the &ldquo;Shared calendar
          link&rdquo; under Site Content → Descriptors to include it in invite emails.
        </p>
      </div>

      {/* Close the Alley */}
      <Card id="closures" pad="md" className="mb-6">
        <h2 className="text-xl font-semibold text-ink">Close the Alley</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Block new bookings for a space (or the whole building) on a date — all day or for a time window.
          Existing bookings aren&apos;t affected.
        </p>

        <form action={addClosure} className="mt-4 grid gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label">Space</label>
              <select name="space" className="field" defaultValue="all">
                <option value="all">Whole building</option>
                {SPACES.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">From date</label>
              <input name="start_date" type="date" required className="field" />
            </div>
            <div>
              <label className="label">To date (optional)</label>
              <input name="end_date" type="date" className="field" />
            </div>
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="all_day" defaultChecked />
            <span className="text-sm font-semibold text-ink-soft">All day</span>
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label">From time (if not all day)</label>
              <input name="start_time" type="time" className="field" />
            </div>
            <div>
              <label className="label">To time</label>
              <input name="end_time" type="time" className="field" />
            </div>
            <div>
              <label className="label">Reason (optional)</label>
              <input name="reason" placeholder="Holiday, private event…" className="field" />
            </div>
          </div>
          <Button type="submit" className="w-fit">Add closure</Button>
        </form>

        {closures.length ? (
          <ul className="mt-5 divide-y divide-line">
            {closures.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="text-ink-soft">
                  <strong className="text-ink">{SPACE_LABEL[c.space] || c.space}</strong>{" "}
                  {formatDate(c.start_date)}
                  {c.end_date !== c.start_date ? ` – ${formatDate(c.end_date)}` : ""}
                  {c.start_time && c.end_time ? ` · ${formatTime(c.start_time)}–${formatTime(c.end_time)}` : " · all day"}
                  {c.reason ? ` · ${c.reason}` : ""}
                </span>
                <form action={removeClosure}>
                  <input type="hidden" name="id" value={c.id} />
                  <button className="text-xs font-semibold text-rust hover:underline">Remove</button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-ink-muted">No closures set.</p>
        )}
      </Card>

      <div>
        <AdminCalendar items={items} closedDates={closedDates} />
      </div>

      {items.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">
          Nothing on the calendar yet. Approved bookings and published events will
          appear here.
        </p>
      ) : null}
    </div>
  );
}

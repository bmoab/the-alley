import AdminCalendar from "@/components/AdminCalendar.js";
import { listBookings } from "@/lib/bookings.js";
import { listLiveEvents } from "@/lib/catalog.js";
import { spaceName } from "@/lib/constants.js";

export const metadata = { title: "Calendar" };
export const dynamic = "force-dynamic";

export default function CalendarPage() {
  const held = listBookings({ status: "held" });
  const confirmed = listBookings({ status: "confirmed" });
  const events = listLiveEvents();

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

  const items = [...bookingItems, ...eventItems];

  return (
    <div>
      <p className="eyebrow">Admin</p>
      <h1 className="font-display text-3xl font-semibold text-ink">Calendar</h1>
      <p className="mt-1 text-ink-muted">
        Held and confirmed bookings plus live public events, color-coded by space.
      </p>

      <div className="mt-4 rounded-lg border border-ink/10 bg-paper-warm p-4 text-sm">
        <p className="font-semibold text-ink">Sync to Google Calendar &amp; Skylight</p>
        <p className="mt-1 text-ink-muted">
          Subscribe any calendar to this live feed of your public events (Google Calendar → Other calendars →
          From URL; Skylight → Add calendar → iCal/URL):
        </p>
        <code className="mt-2 block break-all rounded bg-paper-card p-2 text-xs text-ink-soft">
          {(process.env.APP_URL || "") + "/calendar.ics"}
        </code>
        <p className="mt-2 text-xs text-ink-muted">
          Once it&apos;s in Google Calendar, share that calendar with your tenants. Set the &ldquo;Shared calendar
          link&rdquo; under Site Content → Descriptors to include it in invite emails.
        </p>
      </div>

      <div className="mt-6">
        <AdminCalendar items={items} />
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

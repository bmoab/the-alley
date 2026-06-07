import { listLiveEvents } from "@/lib/catalog.js";
import EventsView from "@/components/EventsView.js";

export const metadata = { title: "Events" };

export default function EventsPage() {
  const events = listLiveEvents();

  return (
    <main className="container-content py-14">
      <p className="eyebrow">What&apos;s on</p>
      <h1 className="mt-2 font-display text-4xl font-semibold text-ink">Calendar</h1>
      <p className="mt-3 max-w-2xl text-lg text-ink-muted">
        Workshops, classes, markets, and gatherings hosted by our community. Each
        listing links you straight to the host — they handle their own tickets
        and payment.
      </p>
      <div className="mt-10">
        <EventsView events={events} />
      </div>
    </main>
  );
}

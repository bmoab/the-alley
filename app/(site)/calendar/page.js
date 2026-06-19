import { listLiveEvents } from "@/lib/catalog.js";
import PageHero from "@/components/site/PageHero.js";
import EventsCalendar from "@/components/EventsCalendar.js";

export const metadata = { title: "Calendar" };
export const dynamic = "force-dynamic";

export default function CalendarPage() {
  const events = listLiveEvents();
  return (
    <main className="ipage">
      <PageHero
        eyebrow="What's on"
        title="Calendar"
        lede="Workshops, classes, markets, and gatherings hosted by our community. Each listing links you straight to the host — they handle their own tickets and payment."
      />
      <section className="wrap">
        <EventsCalendar events={events} />
      </section>
    </main>
  );
}

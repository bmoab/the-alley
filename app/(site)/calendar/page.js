import { listLiveEvents } from "@/lib/catalog.js";
import { venueToday } from "@/lib/constants.js";
import { getContentValue } from "@/lib/db.js";
import PageHero from "@/components/site/PageHero.js";
import EventsCalendar from "@/components/EventsCalendar.js";

export const metadata = { title: "Calendar" };
export const dynamic = "force-dynamic";

export default function CalendarPage() {
  // Everything live, past included — the month grid is a real calendar you can
  // page back through. The LIST view trims to today onward (see EventsCalendar);
  // a "what's on" list led by last month's workshops reads as a dead calendar.
  // Cut-off is computed here, in the venue's timezone, so the server and client
  // agree on which day it is.
  const events = listLiveEvents();
  return (
    <main className="ipage">
      <PageHero
        eyebrow={getContentValue("calendar_hero_eyebrow", "What's on")}
        title={getContentValue("calendar_hero_title", "Calendar")}
        lede={getContentValue(
          "calendar_hero_lede",
          "Workshops, classes, markets, and gatherings hosted by our community. Each listing links you straight to the host — they handle their own tickets and payment."
        )}
        editKeys={{ eyebrow: "calendar_hero_eyebrow", title: "calendar_hero_title", lede: "calendar_hero_lede" }}
      />
      <section className="wrap">
        <EventsCalendar events={events} today={venueToday()} />
      </section>
    </main>
  );
}

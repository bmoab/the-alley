import Link from "next/link";
import { getContent } from "@/lib/db.js";
import { listPublicDirectoryWithSuites, listExhibitorsByPhase, listGallery, listUpcomingLiveEvents, listSpacePhotos } from "@/lib/catalog.js";
import { SPACES } from "@/lib/constants.js";
import Hero from "@/components/home/Hero.js";
import SectionHead from "@/components/site/SectionHead.js";
import DestinationsRow from "@/components/home/DestinationsRow.js";
import RoomsTeaser from "@/components/home/RoomsTeaser.js";
import DirectoryGrid from "@/components/home/DirectoryGrid.js";
import ExhibitorsTeaser from "@/components/home/ExhibitorsTeaser.js";
import EventsRow from "@/components/home/EventsRow.js";
import CtaBand from "@/components/site/CtaBand.js";
import InstaStrip from "@/components/site/InstaStrip.js";

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export default function HomePage() {
  const c = getContent();
  const destinations = parseJson(c.home_destinations, []);
  const rotate = parseJson(c.home_hero_rotate, ["MUSIC", "ART", "EVENTS", "COMMUNITY"]);

  const rooms = SPACES.map((s) => ({
    id: s.id,
    name: s.name,
    location: s.location,
    capacity: s.capacity,
    blurb: s.blurb,
    rateLabel: `$${c.standard_rate || 75} / hour`,
    tag: `${s.name.toLowerCase()} · ${s.location.toLowerCase()}`,
    // Lead image = the first photo from this space's gallery (single source).
    image: listSpacePhotos(s.id)[0]?.image_path || null,
  }));

  const tenants = listPublicDirectoryWithSuites();
  const exhibitors = listExhibitorsByPhase().current;
  const events = listUpcomingLiveEvents(3);
  const gallery = listGallery().slice(0, 6);

  return (
    <>
      <Hero eyebrow={c.home_hero_eyebrow} rotate={rotate} lede={c.home_hero_lede || c.home_hero_subtitle} />

      {/* what you'll find here */}
      <section className="b-band wrap" id="directory-intro">
        <p className="b-welcome reveal">
          The Alley is shaped by the people who show up and create here — a living creative ecosystem on
          Center Street where <b>small businesses, artists, events, and community</b> intersect.
        </p>
        <DestinationsRow items={destinations} />
      </section>

      {/* rent a space */}
      <section className="b-band b-band--paper" id="spaces">
        <div className="wrap">
          <SectionHead
            eyebrow="Rent a space"
            title="Two rooms, endless occasions"
            action={<Link href="/spaces" className="rulelink">View rates</Link>}
          />
          <RoomsTeaser rooms={rooms} />
        </div>
      </section>

      {/* directory */}
      <section className="b-band wrap" id="directory">
        <SectionHead
          eyebrow="The directory"
          title="Meet our makers & shops"
          action={<Link href="/directory" className="rulelink">Full directory</Link>}
        />
        <p className="b-leasing">
          Interested in leasing a suite at The Alley? Contact Chelsea at{" "}
          <a href="tel:4355124608">(435) 512-4608</a>.
        </p>
        <DirectoryGrid tenants={tenants} showSuite />
      </section>

      {/* exhibitors */}
      {exhibitors.length ? (
        <section className="b-band wrap" id="exhibitors">
          <SectionHead
            eyebrow="On the walls"
            title="Current exhibitors"
            action={<Link href="/exhibitors" className="rulelink">All exhibitors</Link>}
          />
          <ExhibitorsTeaser exhibitors={exhibitors} />
        </section>
      ) : null}

      {/* events */}
      <section className="b-band b-band--paper" id="events">
        <div className="wrap">
          <SectionHead
            eyebrow="On the calendar"
            title="Upcoming events"
            action={<Link href="/calendar" className="rulelink">All events</Link>}
          />
          <EventsRow events={events} />
        </div>
      </section>

      <CtaBand heading={c.home_cta_heading} subtitle={c.home_cta_subtitle} />

      <section className="b-band b-band--paper">
        <div className="wrap">
          <InstaStrip
            photos={gallery}
            instagramUrl={c.social_instagram}
            instagramHandle="@thealleyoncenter"
          />
        </div>
      </section>
    </>
  );
}

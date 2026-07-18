import Link from "next/link";
import { getContent } from "@/lib/db.js";
import { listPublicDirectoryWithSuites, listExhibitorsByPhase, listGallery, listUpcomingLiveEvents, listSpacePhotos } from "@/lib/catalog.js";
import { SPACES } from "@/lib/constants.js";
import { parseCrop, cropBackgroundStyle } from "@/lib/crop.js";
import Hero from "@/components/home/Hero.js";
import PhotoSlot from "@/components/site/PhotoSlot.js";
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
  const heroCrop = parseCrop(c.home_hero_image_crop);

  return (
    <>
      {/* Hero banner — the site-managed homepage photo (Site Photos admin),
          shown above the headline. When the owner has framed a crop box, render
          that exact rectangle (its shape sets the height); otherwise fall back
          to the older focal-point framing so nothing breaks pre-crop. */}
      {c.home_hero_image ? (
        <div className="wrap" style={{ marginTop: "clamp(16px,3vw,32px)" }} data-edit="home_hero_image">
          {heroCrop ? (
            <div
              className="reveal"
              role="img"
              aria-label="The Alley On Center"
              style={{ ...cropBackgroundStyle(c.home_hero_image, heroCrop), width: "100%", borderRadius: 16, overflow: "hidden" }}
            />
          ) : (
            <PhotoSlot
              src={c.home_hero_image}
              alt="The Alley On Center"
              showTag={false}
              variant="verde"
              className="reveal"
              objectFit={c.home_hero_image_fit || "cover"}
              objectPosition={c.home_hero_image_pos || "50% 50%"}
              style={{
                height: `min(${Number(c.home_hero_image_h) || 440}px, 62vh)`,
                borderRadius: 16,
                overflow: "hidden",
              }}
            />
          )}
        </div>
      ) : null}

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

import Link from "next/link";
import { getContent } from "@/lib/db.js";
import { listUpcomingLiveEvents } from "@/lib/catalog.js";
import { SPACES, formatDate, formatTime, spaceName } from "@/lib/constants.js";
import Placeholder from "@/components/Placeholder.js";
import { Bolt, Stripes } from "@/components/Motifs.js";

export default function HomePage() {
  const c = getContent();
  const featured = listUpcomingLiveEvents(3);

  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden bg-ink text-paper">
        <div className="absolute inset-0 bg-gradient-to-br from-ink via-ink-soft to-ink opacity-95" />
        <div className="absolute -right-24 top-1/2 h-96 w-96 -translate-y-1/2 rounded-full bg-brass/20 blur-3xl" />
        <div className="container-content relative grid gap-10 py-20 lg:grid-cols-12 lg:py-28">
          <div className="lg:col-span-7">
            <div className="flex items-center gap-2 text-brass-light">
              <Bolt className="h-5 w-5" />
              <p className="eyebrow text-brass-light">Logan, Utah</p>
            </div>
            <h1 className="mt-4 font-display text-4xl font-semibold leading-[1.05] sm:text-5xl lg:text-6xl">
              {c.home_hero_tagline}
            </h1>
            <p className="mt-6 max-w-xl text-lg text-paper/70">
              {c.home_hero_subtitle}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/book" className="btn-accent">
                Request to Book a Space
              </Link>
              <Link href="/events" className="btn-ghost border-paper/30 text-paper hover:border-paper">
                See what&apos;s on
              </Link>
            </div>
          </div>
          <div className="relative lg:col-span-5">
            <Stripes className="absolute -left-4 top-6 bottom-6 z-10 text-paper/70" color="currentColor" />
            <Placeholder
              label="The Alley On Center"
              seed={1}
              className="h-64 w-full lg:h-full"
            />
          </div>
        </div>
      </section>

      {/* Intro */}
      <section className="container-content py-16">
        <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-7">
            <p className="eyebrow">Welcome</p>
            <p className="mt-3 font-display text-2xl leading-relaxed text-ink sm:text-3xl">
              {c.home_intro}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 lg:col-span-5">
            <Link href="/directory" className="card p-5 transition hover:border-brass/50">
              <div className="text-lg font-semibold text-ink">Directory</div>
              <p className="mt-1 text-sm text-ink-muted">Meet our makers & shops</p>
            </Link>
            <Link href="/spaces" className="card p-5 transition hover:border-brass/50">
              <div className="text-lg font-semibold text-ink">The Loft</div>
              <p className="mt-1 text-sm text-ink-muted">Host your gathering</p>
            </Link>
            <Link href="/gallery" className="card p-5 transition hover:border-brass/50">
              <div className="text-lg font-semibold text-ink">The Alley Gallery</div>
              <p className="mt-1 text-sm text-ink-muted">Wander the building</p>
            </Link>
            <Link href="/events" className="card p-5 transition hover:border-brass/50">
              <div className="text-lg font-semibold text-ink">Calendar</div>
              <p className="mt-1 text-sm text-ink-muted">Classes & happenings</p>
            </Link>
          </div>
        </div>
      </section>

      {/* Spaces teaser */}
      <section className="bg-paper-warm py-16">
        <div className="container-content">
          <div className="flex items-end justify-between">
            <div>
              <p className="eyebrow">Rent a space</p>
              <h2 className="mt-2 font-display text-3xl font-semibold text-ink">
                Two rooms, endless occasions
              </h2>
            </div>
            <Link href="/spaces" className="hidden text-sm font-semibold text-brass-dark hover:underline sm:block">
              View rates →
            </Link>
          </div>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {SPACES.map((s, i) => (
              <div key={s.id} className="card overflow-hidden">
                <Placeholder label={s.name} seed={i + 2} className="h-44 w-full" rounded="rounded-none" />
                <div className="p-6">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brass-dark">
                    <span>{s.location}</span>
                    <span className="text-ink/30">·</span>
                    <span>{s.capacity}</span>
                  </div>
                  <h3 className="mt-2 font-display text-xl font-semibold text-ink">{s.name}</h3>
                  <p className="mt-2 text-sm text-ink-muted">{s.blurb}</p>
                  <Link href="/book" className="mt-4 inline-block text-sm font-semibold text-brass-dark hover:underline">
                    Request to book →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA band */}
      <section className="bg-ink text-paper">
        <div className="container-content flex flex-col items-start justify-between gap-6 py-14 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-display text-3xl font-semibold sm:text-4xl">
              {c.home_cta_heading || "Bring your gathering to The Alley"}
            </h2>
            <p className="mt-2 text-paper/70">
              {c.home_cta_subtitle || "You bring the idea. We'll help with the space."}
            </p>
          </div>
          <Link href="/book" className="btn-accent shrink-0">
            Request to Book
          </Link>
        </div>
      </section>

      {/* Featured events */}
      <section className="container-content py-16">
        <div className="flex items-end justify-between">
          <div>
            <p className="eyebrow">On the calendar</p>
            <h2 className="mt-2 font-display text-3xl font-semibold text-ink">
              Upcoming events
            </h2>
          </div>
          <Link href="/events" className="text-sm font-semibold text-brass-dark hover:underline">
            All events →
          </Link>
        </div>

        {featured.length === 0 ? (
          <div className="mt-8 card p-10 text-center text-ink-muted">
            No public events are listed yet — check back soon, or{" "}
            <Link href="/book" className="font-semibold text-brass-dark hover:underline">
              host your own
            </Link>
            .
          </div>
        ) : (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((e, i) => (
              <Link key={e.id} href={`/events/${e.id}`} className="card overflow-hidden transition hover:border-brass/50">
                <Placeholder src={e.photo_path} label={e.title} seed={i + 5} className="h-40 w-full" rounded="rounded-none" />
                <div className="p-5">
                  <div className="text-xs font-semibold uppercase tracking-wider text-brass-dark">
                    {formatDate(e.date)} {e.time ? `· ${formatTime(e.time)}` : ""}
                  </div>
                  <h3 className="mt-1 font-display text-lg font-semibold text-ink">{e.title}</h3>
                  <p className="mt-1 text-sm text-ink-muted">
                    {e.host_name ? `Hosted by ${e.host_name}` : spaceName(e.space)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

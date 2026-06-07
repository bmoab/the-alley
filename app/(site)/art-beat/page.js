import Link from "next/link";
import Placeholder from "@/components/Placeholder.js";

export const metadata = { title: "Center Street Art Beat" };

const WAYS = [
  ["Perform", "Musicians and performers — share your sound with the valley."],
  ["Vend", "Makers and small businesses — bring a booth and meet the community."],
  ["Volunteer", "Lend a hand setting up, running, and celebrating the day."],
  ["Share art", "Visual artists and creators — show your work where it'll be seen."],
];

export default function ArtBeatPage() {
  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden bg-ink text-paper">
        <div className="absolute inset-0 bg-gradient-to-br from-ink via-ink-soft to-ink opacity-95" />
        <div className="absolute -right-24 top-1/2 h-96 w-96 -translate-y-1/2 rounded-full bg-brass/20 blur-3xl" />
        <div className="container-content relative py-20 lg:py-28">
          <p className="eyebrow text-brass-light">August 29, 2026 · Logan, Utah</p>
          <h1 className="mt-4 max-w-3xl font-display text-4xl font-semibold leading-[1.05] sm:text-5xl lg:text-6xl">
            Center Street Art Beat
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-paper/70">
            A community-powered music and arts fest built by the people who show
            up — a day dedicated to celebrating the creativity, connection, and
            energy of our local community.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/contact" className="btn-accent">Get involved</Link>
            <Link href="/events" className="btn-ghost border-paper/30 text-paper hover:border-paper">
              See the calendar
            </Link>
          </div>
        </div>
      </section>

      {/* Intro */}
      <section className="container-content py-16">
        <div className="grid gap-10 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-7">
            <p className="eyebrow">A day for the whole valley</p>
            <p className="mt-3 font-display text-2xl leading-relaxed text-ink sm:text-3xl">
              We&apos;re amplifying the sounds of emerging artists and making room
              for everyone — artists, musicians, vendors, volunteers, and
              neighbors — to come together on Center Street.
            </p>
          </div>
          <div className="lg:col-span-5">
            <Placeholder label="Center Street Art Beat" seed={7} className="h-64 w-full" />
          </div>
        </div>
      </section>

      {/* Ways to participate */}
      <section className="bg-paper-warm py-16">
        <div className="container-content">
          <p className="eyebrow">Be part of it</p>
          <h2 className="mt-2 font-display text-3xl font-semibold text-ink">
            Ways to take part
          </h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {WAYS.map(([title, desc], i) => (
              <div key={title} className="card p-6">
                <div className="font-display text-xl font-semibold text-brass-dark">
                  0{i + 1}
                </div>
                <h3 className="mt-2 font-display text-lg font-semibold text-ink">{title}</h3>
                <p className="mt-1 text-sm text-ink-muted">{desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-8">
            <Link href="/contact" className="btn-primary">
              Reach out to join in
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

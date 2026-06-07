import Link from "next/link";
import { getContent } from "@/lib/db.js";
import Placeholder from "@/components/Placeholder.js";

export const metadata = { title: "About" };

const FOUNDERS = [
  [
    "Chelsea Funk",
    "Co-Founder",
    "Owner of Presidio Real Estate Cache Valley and mother of four. Chelsea saw the untapped potential of her hometown and set out to create a space where local professionals can thrive and connect.",
  ],
  [
    "Caylee Funk",
    "Co-Founder",
    "Owner of Lucid Hair Collective. Caylee brings a fresh perspective to the creative space, with a dedication to fostering collaboration and innovation.",
  ],
];

const PILLARS = [
  "Living Creative Ecosystem",
  "Space to Gather & Create",
  "Rooted in Local",
  "Community Over Competition",
  "Art in Everyday Life",
  "Intentional Design",
  "Events That Bring People Together",
  "Built by Community",
];

export default function AboutPage() {
  const c = getContent();
  const paragraphs = (c.about_body || "").split("\n").filter((p) => p.trim());

  return (
    <main>
      <section className="bg-ink text-paper">
        <div className="container-content py-20">
          <p className="eyebrow text-brass-light">Our story</p>
          <h1 className="mt-3 max-w-3xl font-display text-4xl font-semibold leading-tight sm:text-5xl">
            More than a building; an invitation.
          </h1>
        </div>
      </section>

      <section className="container-content grid gap-12 py-16 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <div className="space-y-5 text-lg leading-relaxed text-ink-soft">
            {paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <Link href="/directory" className="btn-primary mt-8">
            Meet the makers
          </Link>
        </div>
        <div className="lg:col-span-5">
          <Placeholder label="The Alley" seed={3} className="h-80 w-full" />
          <blockquote className="mt-6 border-l-2 border-brass pl-5 font-display text-xl italic text-ink">
            “Art is what we use to decorate space. Music is what we use to
            decorate time.”
          </blockquote>
        </div>
      </section>

      {/* Founders */}
      <section className="bg-paper-warm py-16">
        <div className="container-content">
          <p className="eyebrow">The founders</p>
          <h2 className="mt-2 font-display text-3xl font-semibold text-ink">
            Built by a Cache Valley mother and daughter
          </h2>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {FOUNDERS.map(([name, role, bio]) => (
              <div key={name} className="card flex gap-5 p-6">
                <Placeholder label={name} seed={name.length} className="h-20 w-20 shrink-0" rounded="rounded-full" />
                <div>
                  <h3 className="font-display text-xl font-semibold text-ink">{name}</h3>
                  <div className="text-xs font-semibold uppercase tracking-wider text-brass-dark">{role}</div>
                  <p className="mt-2 text-sm text-ink-muted">{bio}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pillars */}
      <section className="container-content py-16">
        <p className="eyebrow">What we stand for</p>
        <h2 className="mt-2 font-display text-3xl font-semibold text-ink">
          The ideas that hold The Alley together
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PILLARS.map((p, i) => (
            <div key={p} className="card p-5">
              <div className="font-display text-2xl font-semibold text-brass-dark">
                {String(i + 1).padStart(2, "0")}
              </div>
              <div className="mt-1 font-semibold text-ink">{p}</div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

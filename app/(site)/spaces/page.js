import Link from "next/link";
import { SPACES, formatMoney } from "@/lib/constants.js";
import { getSettings, getContent } from "@/lib/db.js";
import Placeholder from "@/components/Placeholder.js";

export const metadata = { title: "The Spaces" };

export default function SpacesPage() {
  const s = getSettings();
  const c = getContent();
  const rate = Number(s.standard_rate || 75);
  const minHours = Number(s.minimum_hours || 2);
  const deposit = Number(s.deposit || 150);

  return (
    <main>
      <section className="container-content py-14">
        <p className="eyebrow">Rent a space</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-ink">The Loft &amp; more</h1>
        <p className="mt-3 max-w-2xl text-lg text-ink-muted">
          You bring the idea — we&apos;ll help with the space. From workshops and
          meetings to markets and celebrations, The Alley gives you a warm,
          characterful room where ideas turn into experiences.
        </p>

        {/* Rate banner */}
        <div className="mt-8 card flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-x-10 gap-y-3">
            <div>
              <div className="text-2xl font-semibold text-ink">{formatMoney(rate)}<span className="text-base font-normal text-ink-muted">/hour</span></div>
              <div className="text-xs uppercase tracking-wider text-ink-muted">Both spaces</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-ink">{minHours} hours</div>
              <div className="text-xs uppercase tracking-wider text-ink-muted">Minimum booking</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-ink">{formatMoney(deposit)}</div>
              <div className="text-xs uppercase tracking-wider text-ink-muted">Refundable deposit</div>
            </div>
          </div>
          <Link href="/book" className="btn-accent shrink-0">Request to Book</Link>
        </div>

        {/* The two spaces */}
        <div className="mt-12 space-y-12">
          {SPACES.map((space, i) => (
            <div
              key={space.id}
              className={`grid items-center gap-8 lg:grid-cols-2 ${i % 2 ? "lg:[direction:rtl]" : ""}`}
            >
              <Placeholder
                src={c[`space_${space.id}_image`]}
                alt={space.name}
                label={space.name}
                seed={i + 2}
                className="h-64 w-full lg:h-80 [direction:ltr]"
              />
              <div className="[direction:ltr]">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brass-dark">
                  <span>{space.location}</span>
                  <span className="text-ink/30">·</span>
                  <span>{space.capacity}</span>
                </div>
                <h2 className="mt-2 font-display text-3xl font-semibold text-ink">
                  {space.name}
                </h2>
                <p className="mt-3 text-ink-muted">{space.blurb}</p>
                <Link href="/book" className="btn-primary mt-5">
                  Request {space.name}
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Rental agreement */}
      <section className="bg-paper-warm py-14">
        <div className="container-content flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-display text-2xl font-semibold text-ink">
              Rental agreement
            </h2>
            <p className="mt-2 max-w-lg text-ink-muted">
              Please review our rental terms before booking. You&apos;ll be asked
              to agree to them when you submit a request, and we&apos;ll attach a
              copy to your approval email.
            </p>
          </div>
          <a
            href="/uploads/rental-agreement.pdf"
            target="_blank"
            rel="noreferrer"
            className="btn-ghost shrink-0"
          >
            ↓ View the agreement (PDF)
          </a>
        </div>
      </section>
    </main>
  );
}

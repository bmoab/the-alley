import Link from "next/link";
import { notFound } from "next/navigation";
import { getEvent } from "@/lib/catalog.js";
import { formatDate, formatTime, spaceName } from "@/lib/constants.js";
import Placeholder from "@/components/Placeholder.js";

export function generateMetadata({ params }) {
  const e = getEvent(params.id);
  return { title: e?.title || "Event" };
}

export default function EventDetailPage({ params }) {
  const e = getEvent(params.id);
  if (!e || e.status !== "live") notFound();

  let pdfs = [];
  try {
    pdfs = e.pdf_paths ? JSON.parse(e.pdf_paths) : [];
  } catch {
    pdfs = [];
  }

  return (
    <main className="container-content py-14">
      <Link href="/events" className="text-sm font-semibold text-brass-dark hover:underline">
        ← All events
      </Link>

      <div className="mt-6 grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Placeholder src={e.photo_path} label={e.title} seed={e.id} className="h-72 w-full sm:h-96" />
        </div>

        <div className="lg:col-span-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-brass-dark">
            {formatDate(e.date)} {e.time ? `· ${formatTime(e.time)}` : ""}
          </div>
          <h1 className="mt-2 font-display text-3xl font-semibold text-ink">{e.title}</h1>
          <p className="mt-2 text-ink-muted">
            {e.host_name ? `Hosted by ${e.host_name}` : "Hosted by The Alley"}
            {e.space ? ` · ${spaceName(e.space)}` : ""}
          </p>

          <div className="mt-5 flex flex-wrap gap-x-8 gap-y-2 text-sm">
            {e.tickets ? (
              <div><span className="font-semibold text-ink">{e.tickets}</span> <span className="text-ink-muted">spots available</span></div>
            ) : null}
            {e.price ? (
              <div><span className="font-semibold text-ink">{e.price}</span> <span className="text-ink-muted">per spot</span></div>
            ) : null}
          </div>

          {/* Host payment instructions */}
          {(e.payment_instructions || e.payment_link) ? (
            <div className="mt-6 card p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-brass-dark">
                How to reserve your spot
              </h2>
              {e.payment_instructions ? (
                <p className="mt-2 text-sm text-ink-soft">{e.payment_instructions}</p>
              ) : null}
              {e.payment_link ? (
                <a href={e.payment_link} target="_blank" rel="noreferrer" className="btn-accent mt-3">
                  Pay the host →
                </a>
              ) : null}
              <p className="mt-3 text-xs text-ink-muted">
                The Alley provides this listing as a courtesy — payment goes
                directly to the host.
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {/* Description */}
      {e.description ? (
        <div className="mt-10 max-w-3xl">
          <h2 className="font-display text-xl font-semibold text-ink">About this event</h2>
          <div className="mt-3 space-y-4 whitespace-pre-line text-ink-soft">{e.description}</div>
        </div>
      ) : null}

      {/* PDFs */}
      {pdfs.length > 0 ? (
        <div className="mt-8 max-w-3xl">
          <h2 className="font-display text-xl font-semibold text-ink">Downloads</h2>
          <ul className="mt-3 space-y-2">
            {pdfs.map((p, i) => (
              <li key={i}>
                <a href={p} target="_blank" rel="noreferrer" className="text-sm font-semibold text-brass-dark hover:underline">
                  ↓ {p.split("/").pop()}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </main>
  );
}

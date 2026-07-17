import Link from "next/link";
import { notFound } from "next/navigation";
import { getEvent, normalizeLinkUrl, parseEventLinks } from "@/lib/catalog.js";
import { directoryLinkLabel } from "@/lib/link-label.js";
import { formatDate, formatTime, spaceName } from "@/lib/constants.js";
import PhotoSlot from "@/components/site/PhotoSlot.js";
import EventPhoto from "@/components/site/EventPhoto.js";

export function generateMetadata({ params }) {
  const e = getEvent(params.id);
  return { title: e?.title || "Event" };
}

export default function EventDetailPage({ params }) {
  const e = getEvent(params.id);
  if (!e || e.status !== "live") notFound();
  const links = parseEventLinks(e);

  let pdfs = [];
  try {
    pdfs = e.pdf_paths ? JSON.parse(e.pdf_paths) : [];
  } catch {
    pdfs = [];
  }

  return (
    <main className="ipage wrap" style={{ paddingTop: "clamp(110px,14vw,150px)" }}>
      <Link href="/calendar" className="rulelink" style={{ flexDirection: "row", alignItems: "center" }}>
        ← All events
      </Link>

      <div style={{ marginTop: 28, display: "grid", gap: "clamp(24px,4vw,48px)", gridTemplateColumns: "minmax(0,1.1fr) minmax(0,.9fr)" }} className="ev-detail-grid">
        {e.photo_path ? (
          // A real flyer: show it whole (posters are portrait and were being
          // cropped) and let attendees tap to read it full-screen.
          <EventPhoto src={e.photo_path} alt={e.title || "Event flyer"} />
        ) : (
          <PhotoSlot src={null} tag={e.title} showTag={false} variant="verde" style={{ minHeight: 320 }} />
        )}
        <div>
          <p className="eyebrow" style={{ color: "var(--verde-deep)" }}>
            {formatDate(e.date)} {e.time ? `· ${formatTime(e.time)}` : ""}{e.end_label ? ` · ${e.end_label}` : ""}
          </p>
          <h1 className="space-name" style={{ marginTop: 8 }}>{e.title}</h1>
          <p className="mono" style={{ color: "var(--ink-muted)", fontSize: 12, letterSpacing: ".06em" }}>
            {e.host_name ? `Hosted by ${e.host_name}` : "Hosted by The Alley"}
            {e.space ? ` · ${spaceName(e.space)}` : ""}
          </p>

          <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: "8px 28px" }}>
            {e.tickets ? <div><b>{e.tickets}</b> <span style={{ color: "var(--ink-muted)" }}>spots</span></div> : null}
            {e.price ? <div><b>{e.price}</b> <span style={{ color: "var(--ink-muted)" }}>per spot</span></div> : null}
          </div>

          {e.payment_instructions || e.payment_link ? (
            <div className="card" style={{ marginTop: 22, padding: 20 }}>
              <p className="eyebrow" style={{ color: "var(--verde-deep)" }}>How to reserve your spot</p>
              {e.payment_instructions ? <p style={{ marginTop: 8, color: "var(--ink-soft)", fontWeight: 300 }}>{e.payment_instructions}</p> : null}
              {e.payment_link ? (
                <a href={normalizeLinkUrl(e.payment_link)} target="_blank" rel="noreferrer" className="btn btn--solid" style={{ marginTop: 14 }}>
                  Pay the host →
                </a>
              ) : null}
              <p className="mono" style={{ marginTop: 12, fontSize: 11, color: "var(--ink-muted)" }}>
                The Alley provides this listing as a courtesy — payment goes directly to the host.
              </p>
            </div>
          ) : null}

          {links.length ? (
            <div style={{ marginTop: 22, display: "flex", flexWrap: "wrap", gap: 10 }}>
              {links.map((l, i) => (
                <a
                  key={i}
                  className={"btn " + (i === 0 ? "btn--solid" : "btn--ghost")}
                  href={l.url}
                  target={l.url.startsWith("http") ? "_blank" : undefined}
                  rel={l.url.startsWith("http") ? "noreferrer" : undefined}
                >
                  {directoryLinkLabel(l)} →
                </a>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {e.description ? (
        <div style={{ marginTop: 40, maxWidth: "60ch" }}>
          <h2 className="space-name" style={{ fontSize: "clamp(22px,2.4vw,30px)" }}>About this event</h2>
          <div style={{ marginTop: 12, whiteSpace: "pre-line", color: "var(--ink-soft)", fontWeight: 300, lineHeight: 1.7 }}>{e.description}</div>
        </div>
      ) : null}

      {pdfs.length ? (
        <div style={{ marginTop: 32, maxWidth: "60ch" }}>
          <h2 className="space-name" style={{ fontSize: "clamp(22px,2.4vw,30px)" }}>Downloads</h2>
          <ul style={{ marginTop: 12, listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
            {pdfs.map((p, i) => (
              <li key={i}>
                <a href={p} target="_blank" rel="noreferrer" className="rulelink" style={{ flexDirection: "row" }}>
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

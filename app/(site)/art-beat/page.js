import Link from "next/link";
import { getContentValue } from "@/lib/db.js";
import PhotoSlot from "@/components/site/PhotoSlot.js";

export const metadata = { title: "Center Street Art Beat" };

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export default function ArtBeatPage() {
  const ab = parseJson(getContentValue("art_beat"), {
    date: "August 29, 2026 · Logan, Utah",
    intro: "",
    ways: [],
  });

  return (
    <main>
      <header className="ab-hero">
        <div className="wallpaper" aria-hidden="true" />
        <div className="wrap ab-hero-inner">
          <p className="eyebrow">{ab.date}</p>
          <h1>Center Street Art Beat</h1>
          <p>
            A community-powered music and arts fest built by the people who show up — a day dedicated to
            celebrating the creativity, connection, and energy of our local community.
          </p>
          <div className="ab-hero-cta">
            <Link className="btn btn--verde" href="/contact">Get involved</Link>
          </div>
        </div>
      </header>

      <section className="iband wrap">
        <div className="ab-intro">
          <div>
            <p className="eyebrow">A day for the whole valley</p>
            <p className="big">{ab.intro}</p>
          </div>
          <PhotoSlot tag="Center Street Art Beat" variant="verde" className="reveal" />
        </div>
      </section>

      <section className="iband iband--paper">
        <div className="wrap">
          <p className="eyebrow">Be part of it</p>
          <h2 className="sec-title" style={{ marginTop: 8 }}>Ways to take part</h2>
          <div className="ways-grid">
            {(ab.ways || []).map(([title, desc], i) => (
              <div key={title} className="way-card reveal">
                <div className="way-num">0{i + 1}</div>
                <h3>{title}</h3>
                <p>{desc}</p>
              </div>
            ))}
          </div>
          <div style={{ marginTop: "clamp(28px,3vw,40px)" }}>
            <Link className="btn btn--solid" href="/contact">Reach out to join in</Link>
          </div>
        </div>
      </section>
    </main>
  );
}

import Link from "next/link";
import { getContent } from "@/lib/db.js";
import PageHero from "@/components/site/PageHero.js";
import PhotoSlot from "@/components/site/PhotoSlot.js";

export const metadata = { title: "About" };

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export default function AboutPage() {
  const c = getContent();
  const body = (c.about_body || "").split(/\n+/).filter(Boolean);
  const founders = parseJson(c.about_founders, []);
  const pillars = parseJson(c.about_pillars, []);

  return (
    <main className="ipage">
      <PageHero eyebrow="Our story" title="More than a building; an invitation." />

      <section className="wrap iband" style={{ paddingTop: "clamp(20px,3vw,40px)" }}>
        <div className="about-grid">
          <div className="about-body">
            {body.map((p, i) => <p key={i}>{p}</p>)}
            <Link className="btn btn--solid" href="/directory" style={{ marginTop: 10 }}>Meet the makers</Link>
          </div>
          <div>
            <PhotoSlot src={c.about_image || null} tag="The Alley" variant="verde" style={{ height: "clamp(280px,30vw,360px)" }} />
            <blockquote className="about-quote">
              &ldquo;Art is what we use to decorate space. Music is what we use to decorate time.&rdquo;
            </blockquote>
          </div>
        </div>
      </section>

      {founders.length ? (
        <section className="iband iband--paper">
          <div className="wrap">
            <p className="eyebrow">The founders</p>
            <h2 className="sec-title" style={{ marginTop: 8 }}>Built by a Cache Valley mother and daughter</h2>
            <div className="founders-grid">
              {founders.map((f) => (
                <div key={f.name} className="founder reveal">
                  <PhotoSlot src={f.photo || null} tag="" variant="soft" showTag={false} />
                  <div>
                    <h3>{f.name}</h3>
                    <div className="role">{f.role}</div>
                    <p>{f.bio}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {pillars.length ? (
        <section className="iband wrap">
          <p className="eyebrow">What we stand for</p>
          <h2 className="sec-title" style={{ marginTop: 8 }}>The ideas that hold The Alley together</h2>
          <div className="pillars-grid">
            {pillars.map((p, i) => (
              <div key={p} className="pillar reveal">
                <div className="pn">{String(i + 1).padStart(2, "0")}</div>
                <div className="pt">{p}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

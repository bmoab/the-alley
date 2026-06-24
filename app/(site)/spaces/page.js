import { SPACES } from "@/lib/constants.js";
import { getSettings, getContent, getContentValue } from "@/lib/db.js";
import { listSpacePhotos } from "@/lib/catalog.js";
import PageHero from "@/components/site/PageHero.js";
import SpaceGallery from "@/components/site/SpaceGallery.js";
import RequestButton from "@/components/site/RequestButton.js";
import { Arrow } from "@/components/site/Primitives.js";

export const metadata = { title: "Spaces — Request to Book" };

export default function SpacesPage() {
  const s = getSettings();
  const c = getContent();
  const rate = Number(s.standard_rate) || 75;
  const minHours = Number(s.minimum_hours) || 2;
  const deposit = Number(s.deposit) || 150;

  // "{deposit}" in the editable body is replaced with the live deposit amount.
  const bookBody = getContentValue(
    "spaces_book_body",
    "Every booking includes a refundable {deposit} cleaning deposit and a quick rental agreement. We'll review your request and email you within a day to confirm — no charge happens until then."
  ).replaceAll("{deposit}", `$${deposit}`);

  return (
    <main className="ipage">
      <PageHero
        eyebrow={getContentValue("spaces_hero_eyebrow", "Rent a space")}
        title={getContentValue("spaces_hero_title", "The Loft & more")}
        lede={getContentValue(
          "spaces_hero_lede",
          "You bring the idea — we'll help with the space. From workshops and meetings to markets and celebrations, The Alley gives you a warm, characterful room where ideas turn into experiences."
        )}
        editKeys={{ eyebrow: "spaces_hero_eyebrow", title: "spaces_hero_title", lede: "spaces_hero_lede" }}
      />

      <section className="wrap">
        <div className="rate-banner reveal">
          <div className="rate-stats">
            <div className="rate-stat"><div className="n">${rate}<small>/hour</small></div><div className="k">Per space</div></div>
            <div className="rate-stat"><div className="n">{minHours} hours</div><div className="k">Minimum booking</div></div>
            <div className="rate-stat"><div className="n">${deposit}</div><div className="k">Refundable deposit</div></div>
          </div>
          <a className="rulelink" href="/rental-agreement.pdf" target="_blank" rel="noreferrer">
            Rental agreement <Arrow />
          </a>
        </div>

        <div style={{ marginTop: "clamp(44px,5vw,76px)" }}>
          {SPACES.map((r, i) => (
            <div key={r.id} id={r.id} className={"space-row reveal" + (i % 2 ? " is-rev" : "")}>
              <SpaceGallery photos={listSpacePhotos(r.id)} lead={i === 0 ? "verde" : "soft"} />
              <div>
                <div className="space-meta">
                  <span>{r.location}</span>
                  <span className="sep">·</span>
                  <span>{r.capacity}</span>
                </div>
                <h2 className="space-name">{r.name}</h2>
                <p className="space-blurb">{r.blurb}</p>
                <ul className="space-features">
                  {r.features.map((f) => <li key={f}>{f}</li>)}
                </ul>
                <RequestButton room={r.id}>
                  Request {r.name} <span className="arrow" style={{ marginLeft: 4 }}>→</span>
                </RequestButton>
              </div>
            </div>
          ))}
        </div>

        <div className="iband iband--verde" style={{ marginTop: "clamp(48px,6vw,84px)", padding: "clamp(26px,3vw,40px)", border: "1px solid var(--line-strong)" }}>
          <div className="agreement">
            <div>
              <h2 data-edit="spaces_book_heading">{getContentValue("spaces_book_heading", "Before you book")}</h2>
              <p style={{ color: "var(--ink-soft)" }} data-edit="spaces_book_body">{bookBody}</p>
            </div>
            <a className="btn btn--ghost" href="/rental-agreement.pdf" target="_blank" rel="noreferrer">
              Read the agreement
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}

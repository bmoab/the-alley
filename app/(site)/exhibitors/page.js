import Link from "next/link";
import { listExhibitorsByPhase, parseExhibitorLinks } from "@/lib/catalog.js";
import { directoryLinkLabel } from "@/lib/link-label.js";
import { getContentValue } from "@/lib/db.js";
import { formatMonthRange } from "@/lib/constants.js";
import PageHero from "@/components/site/PageHero.js";
import PhotoSlot from "@/components/site/PhotoSlot.js";
import ExhibitorCard from "@/components/ExhibitorCard.js";

export const metadata = { title: "Exhibitors" };

const WORK_VARIANTS = ["verde", "", "soft", "verde"];

/** Display label for an exhibitor's dates, falling back to any legacy when_text. */
function whenLabel(ex, { onView = false } = {}) {
  const range = formatMonthRange(ex.active_from, ex.active_until) || ex.when_text || "";
  if (!range) return onView ? "On view" : "";
  return onView ? `On view · ${range}` : range;
}

function CurrentExhibitor({ ex, i }) {
  const portraitVariant = i % 2 ? "soft" : "verde";
  const links = parseExhibitorLinks(ex);
  return (
    <article className={"ex-feature reveal" + (i % 2 ? " is-rev" : "")}>
      <div className="ex-feature-portrait">
        <PhotoSlot src={ex.profile_photo || null} tag={ex.name} variant={portraitVariant} className="ex-portrait" />
        <span className="ex-onview mono">On view</span>
      </div>
      <div className="ex-feature-body">
        <p className="ex-when mono">{whenLabel(ex, { onView: true })}</p>
        <h2 className="ex-name">{ex.name}</h2>
        <p className="ex-discipline mono">{ex.discipline}</p>
        <p className="ex-blurb">{ex.blurb}</p>
        {links.length ? (
          <div className="ex-links">
            {links.map((l, k) => (
              <a key={k} className="ex-handle mono" href={l.url} target="_blank" rel="noreferrer">
                {directoryLinkLabel(l)} →
              </a>
            ))}
          </div>
        ) : ex.site_handle ? (
          <p className="ex-handle mono">{ex.site_handle}</p>
        ) : null}
        {ex.works?.length ? (
          <div className="ex-works">
            {ex.works.map((w, k) => (
              <figure key={w.id ?? k} className="ex-work">
                <PhotoSlot src={w.image_path || null} tag={w.caption || ""} variant={WORK_VARIANTS[k % WORK_VARIANTS.length]} />
              </figure>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export default function ExhibitorsPage() {
  const { current, past } = listExhibitorsByPhase();

  return (
    <main>
      <PageHero
        eyebrow={getContentValue("exhibitors_hero_eyebrow", "The artists")}
        title={getContentValue("exhibitors_hero_title", "Exhibitors")}
        lede={getContentValue(
          "exhibitors_hero_lede",
          "The painters, printers, potters and makers who've filled the gallery walls. Their work rotates each season — here's who's showing now, and everyone who came before."
        )}
        editKeys={{ eyebrow: "exhibitors_hero_eyebrow", title: "exhibitors_hero_title", lede: "exhibitors_hero_lede" }}
      />

      {current.length ? (
        <section className="wrap">
          <header className="ex-sec-head">
            <p className="eyebrow" style={{ color: "var(--verde-deep)" }}>Currently on view</p>
            <h2 className="sec-title" style={{ marginTop: 8 }}>Current exhibitors</h2>
          </header>
          <div className="ex-features">
            {current.map((ex, i) => <CurrentExhibitor key={ex.id} ex={ex} i={i} />)}
          </div>
        </section>
      ) : null}

      {past.length ? (
        <section className="iband iband--paper" style={{ marginTop: "clamp(40px,5vw,72px)" }}>
          <div className="wrap">
            <header className="ex-sec-head ex-sec-head--row">
              <div>
                <p className="eyebrow" style={{ color: "var(--verde-deep)" }}>From the archive</p>
                <h2 className="sec-title" style={{ marginTop: 8 }}>Past exhibitors</h2>
              </div>
              <p className="ex-flip-tip mono">Tap a card to flip ↻</p>
            </header>
            <div className="ex-past-grid">
              {past.map((ex, i) => (
                <ExhibitorCard key={ex.id} ex={ex} when={whenLabel(ex)} variant={["", "verde", "soft"][i % 3]} />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="iband iband--verde">
        <div className="wrap ex-cta">
          <div>
            <h2 data-edit="exhibitors_cta_heading">{getContentValue("exhibitors_cta_heading", "Want to show your work?")}</h2>
            <p data-edit="exhibitors_cta_blurb">{getContentValue("exhibitors_cta_blurb", "We host a new exhibitor most seasons — solo walls, group shows, and pop-ups. Tell us what you make.")}</p>
          </div>
          <Link className="btn btn--solid" href="/contact">
            Pitch an exhibition <span className="arrow" style={{ marginLeft: 6 }}>→</span>
          </Link>
        </div>
      </section>
    </main>
  );
}

"use client";
import { useMemo, useState } from "react";
import PhotoSlot from "@/components/site/PhotoSlot.js";
import { Arrow } from "@/components/site/Primitives.js";

/**
 * Category-filtered tenant card grid (used on the homepage preview and the
 * Directory page). `tenants` = directory rows; each card shows its suite tag
 * and links out to the tenant's contact link when present.
 */
export default function DirectoryGrid({ tenants = [], showSuite = false, showLink = false }) {
  const cats = useMemo(() => {
    const seen = [];
    for (const t of tenants) {
      if (t.category && !seen.includes(t.category)) seen.push(t.category);
    }
    return ["All", ...seen];
  }, [tenants]);

  const [cat, setCat] = useState("All");
  const shown = tenants.filter((t) => cat === "All" || t.category === cat);

  const variantFor = (c) => (c === "Art" ? "verde" : c === "Shop" || c === "Retail" ? "soft" : "");

  return (
    <div>
      <div className="dir-chips">
        {cats.map((c) => (
          <button key={c} className={"dir-chip mono" + (c === cat ? " is-on" : "")} onClick={() => setCat(c)}>
            {c}
          </button>
        ))}
      </div>
      <div className="dir-grid">
        {shown.map((t) => {
          const Inner = (
            <>
              <PhotoSlot src={t.photo_path || null} tag={t.category} variant={variantFor(t.category)} className="dir-photo" />
              <div className="dir-info">
                <div className="dir-cardtop">
                  <span className="dir-cat mono">{t.category}</span>
                  {showSuite && t.suite ? <span className="dir-suite mono">Suite {t.suite}</span> : null}
                </div>
                <h4 className="dir-name">{t.business_name}</h4>
                <p className="dir-blurb">{t.description}</p>
                {showLink && t.contact_link ? (
                  <span className="dir-go mono">Visit <Arrow /></span>
                ) : null}
              </div>
            </>
          );
          return t.contact_link ? (
            <a
              key={t.id}
              href={t.contact_link}
              className="dir-card dir-card-link"
              target={t.contact_link.startsWith("http") ? "_blank" : undefined}
              rel={t.contact_link.startsWith("http") ? "noreferrer" : undefined}
            >
              {Inner}
            </a>
          ) : (
            <article key={t.id} className="dir-card">
              {Inner}
            </article>
          );
        })}
      </div>
    </div>
  );
}

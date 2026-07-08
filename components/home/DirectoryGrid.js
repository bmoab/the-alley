"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import PhotoSlot from "@/components/site/PhotoSlot.js";
import { Arrow } from "@/components/site/Primitives.js";

/**
 * Category-filtered tenant card grid (used on the homepage preview and the
 * Directory page). `tenants` = rows from listPublicDirectoryWithSuites; each
 * card links to the tenant's landing page (`t.href`) where all their photos
 * and links live.
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
          const photo = t.photos?.[0] || t.photo_path || null;
          const Inner = (
            <>
              <PhotoSlot src={photo} tag={t.category} variant={variantFor(t.category)} className="dir-photo" />
              <div className="dir-info">
                <div className="dir-cardtop">
                  <span className="dir-cat mono">{t.category}</span>
                  {showSuite && t.suites?.length ? (
                    <span className="dir-suite mono">
                      {t.suites.length > 1 ? "Suites " : "Suite "}
                      {t.suites.map((s) => s.name).join(", ")}
                    </span>
                  ) : null}
                </div>
                <h4 className="dir-name">{t.business_name}</h4>
                <p className="dir-blurb">{t.description}</p>
                {showLink ? (
                  <span className="dir-go mono">See more <Arrow /></span>
                ) : null}
              </div>
            </>
          );
          return t.href ? (
            <Link key={t.id} href={t.href} className="dir-card dir-card-link">
              {Inner}
            </Link>
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

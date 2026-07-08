import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getDirectoryBySlug,
  publicDirectoryShape,
  suitesForTenant,
} from "@/lib/catalog.js";
import { directoryLinkLabel } from "@/lib/link-label.js";
import SpaceGallery from "@/components/site/SpaceGallery.js";
import { Stripes, Arrow } from "@/components/site/Primitives.js";

/**
 * Tenant landing page — /directory/<business-name>-<id>. Every directory card
 * and floor-map card links here; it collects the tenant's photos, description,
 * suite location, and all of their labeled links in one place.
 */

export function generateMetadata({ params }) {
  const row = getDirectoryBySlug(params.slug);
  return { title: row ? row.business_name : "Directory" };
}

export default function TenantPage({ params }) {
  const row = getDirectoryBySlug(params.slug);
  if (!row) notFound();

  const t = publicDirectoryShape(row);
  const suites = suitesForTenant(t.id).map((s) => s.name || s.zone);

  return (
    <main className="ipage">
      <header className="pagehero tenant-hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="pagehero-vert" src="/brand/logo-vertical-black.png" alt="" aria-hidden="true" />
        <Stripes className="pagehero-stripes" count={4} />
        <div className="wrap pagehero-inner">
          <p className="eyebrow">
            {t.category || "The Alley directory"}
            {suites.length
              ? ` · Suite${suites.length > 1 ? "s" : ""} ${suites.join(", ")}`
              : ""}
          </p>
          <h1 className="pagehero-title">{t.business_name}</h1>
        </div>
      </header>

      <section className="wrap">
        <div className="tenant-grid">
          <div className="tenant-photos">
            <SpaceGallery
              photos={t.photos.map((p) => ({ image_path: p, caption: "" }))}
            />
          </div>
          <div className="tenant-side">
            {t.description ? <p className="tenant-blurb">{t.description}</p> : null}
            {t.links.length ? (
              <div className="tenant-links">
                {t.links.map((l, i) => (
                  <a
                    key={i}
                    className={"btn " + (i === 0 ? "btn--solid" : "btn--ghost")}
                    href={l.url}
                    target={l.url.startsWith("http") ? "_blank" : undefined}
                    rel={l.url.startsWith("http") ? "noreferrer" : undefined}
                  >
                    {directoryLinkLabel(l)} <Arrow />
                  </a>
                ))}
              </div>
            ) : null}
            <Link href="/directory" className="tenant-back mono">
              ← Back to the directory
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

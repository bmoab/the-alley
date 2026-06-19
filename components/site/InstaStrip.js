import Link from "next/link";
import PhotoSlot from "@/components/site/PhotoSlot.js";
import { Arrow } from "@/components/site/Primitives.js";

function IgGlyph({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * Instagram strip — grid pulls from the gallery, hover reveals "View Gallery".
 * `photos` is up to 6 gallery rows; `instagram` is the handle text + link.
 */
export default function InstaStrip({ photos = [], instagramUrl, instagramHandle = "@thealleyoncenter" }) {
  const variants = ["", "verde", "soft", "verde", "soft", ""];
  const cells = photos.slice(0, 6);
  while (cells.length < 6) cells.push(null);
  return (
    <div className="insta">
      <div className="insta-head">
        <p className="eyebrow">Follow along</p>
        <h2 className="sec-title">See what&apos;s happening at The Alley</h2>
        <p className="insta-sub">Photos from events, classes, and life on Center Street.</p>
        {instagramUrl ? (
          <a className="insta-iglink" href={instagramUrl} target="_blank" rel="noreferrer">
            <span className="insta-iglink-ic"><IgGlyph /></span>
            <span className="insta-iglink-tx">{instagramHandle}</span>
          </a>
        ) : null}
      </div>
      <Link className="insta-grid" href="/gallery" aria-label="View the gallery">
        {cells.map((p, i) => (
          <span key={i} className="insta-cellwrap">
            <PhotoSlot
              src={p?.image_path || null}
              tag={p?.caption || "the alley"}
              variant={variants[i]}
              className="insta-cell"
              showTag={false}
            />
          </span>
        ))}
        <span className="insta-overlay" aria-hidden="true">
          <span className="insta-overlay-tx">View Gallery <Arrow /></span>
        </span>
      </Link>
    </div>
  );
}

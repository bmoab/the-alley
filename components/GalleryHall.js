"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Lightbox from "@/components/site/Lightbox.js";

/**
 * The Gallery as a dark, curated exhibition wall: a near-black editorial hall
 * with a responsive CSS-column masonry of pure photographs (no labels at rest),
 * a hover-only caption on desktop, tag filter pills with a live count, and a
 * minimal keyboard-navigable lightbox over the currently filtered set.
 *
 * Neutral cream accent (no chromatic accent) so the photography carries the
 * color. `photos` = [{ id, cap, tags[], src }]; `tags` = [{ tag, count }].
 */
export default function GalleryHall({ title, subtitle, lede, photos = [], tags = [], editKeys = {} }) {
  const [filter, setFilter] = useState("All");
  const [lbIndex, setLbIndex] = useState(null); // null = closed
  const wallRef = useRef(null);

  const visible = useMemo(
    () => photos.filter((p) => filter === "All" || p.tags.includes(filter)),
    [photos, filter]
  );

  // Category label for a tile/lightbox: the active filter when filtering,
  // otherwise the photo's first tag.
  const catOf = (p) => (filter !== "All" ? filter : p.tags[0] || "");

  const pickFilter = (t) => {
    setLbIndex(null); // close the lightbox when the set changes
    setFilter(t);
  };

  // Scroll-reveal: fade + rise each tile once as it enters the viewport. The
  // observer stays connected so tiles revealed by a later filter change animate
  // in too. CSS disables this under prefers-reduced-motion.
  useEffect(() => {
    const els = wallRef.current?.querySelectorAll(".gx-tile");
    if (!els || !els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("gx-in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const open = lbIndex !== null;

  return (
    <section className="gx-hall">
      <div className="gx-hall-inner wrap">
        <header className="gx-hall-head">
          {subtitle ? <p className="gx-eyebrow" data-edit={editKeys.subtitle}>{subtitle}</p> : null}
          <h1 className="gx-hall-title" data-edit={editKeys.title}>{title}</h1>
          {lede ? <p className="gx-hall-lede" data-edit={editKeys.lede}>{lede}</p> : null}
        </header>

        <div className="gx-filters" role="group" aria-label="Filter photos by tag">
          <button
            className={"gx-chip" + (filter === "All" ? " is-on" : "")}
            onClick={() => pickFilter("All")}
            aria-pressed={filter === "All"}
          >
            All <span className="gx-chip-n">{photos.length}</span>
          </button>
          {tags.map(({ tag, count }) => (
            <button
              key={tag}
              className={"gx-chip" + (filter === tag ? " is-on" : "")}
              onClick={() => pickFilter(tag)}
              aria-pressed={filter === tag}
            >
              {tag} <span className="gx-chip-n">{count}</span>
            </button>
          ))}
        </div>

        {photos.length ? (
          <>
            <div className="gx-wall" ref={wallRef}>
              {photos.map((photo) => {
                const shown = filter === "All" || photo.tags.includes(filter);
                const pos = shown ? visible.indexOf(photo) : -1;
                const cat = catOf(photo);
                return (
                  <figure
                    key={photo.id}
                    className={"gx-tile" + (shown ? "" : " gx-tile--hide")}
                    role="button"
                    tabIndex={shown ? 0 : -1}
                    aria-label={`${photo.cap} — view larger`}
                    onClick={() => shown && setLbIndex(pos)}
                    onKeyDown={(e) => {
                      if (shown && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        setLbIndex(pos);
                      }
                    }}
                  >
                    {photo.src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="gx-img" src={photo.src} alt={photo.cap} loading="lazy" />
                    ) : (
                      <div className="gx-img gx-img--empty" aria-hidden="true" />
                    )}
                    {/* Caption is revealed on hover (desktop only); CSS hides it
                        entirely on touch so tiles stay pure images on mobile. */}
                    <figcaption className="gx-tile-cap" aria-hidden="true">
                      {cat ? <span className="gx-tile-cat">{cat}</span> : null}
                      <span className="gx-tile-title">{photo.cap}</span>
                    </figcaption>
                  </figure>
                );
              })}
            </div>
            <p className="gx-count" aria-live="polite">
              {visible.length} {visible.length === 1 ? "image" : "images"}
            </p>
          </>
        ) : (
          <p className="gx-empty">No photos here yet — check back soon.</p>
        )}

        <footer className="gx-hall-foot">
          <p className="gx-foot-note">The Alley On Center · Logan, Utah</p>
          <Link className="btn btn--ghost-light" href="/spaces">
            Host your event <span className="arrow" style={{ marginLeft: 6 }}>→</span>
          </Link>
        </footer>
      </div>

      {open ? (
        <Lightbox
          photos={visible.map((p) => ({ ...p, cat: catOf(p) }))}
          index={Math.min(lbIndex, visible.length - 1)}
          setIndex={setLbIndex}
          onClose={() => setLbIndex(null)}
        />
      ) : null}
    </section>
  );
}

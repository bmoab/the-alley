"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useBodyScrollLock } from "@/components/hooks.js";

/**
 * The Gallery as a dark, curated exhibition wall: a near-black editorial hall
 * with a responsive CSS-column masonry of pure photographs (no labels at rest),
 * a hover-only caption on desktop, tag filter pills with a live count, and a
 * minimal keyboard-navigable lightbox over the currently filtered set.
 *
 * Neutral cream accent (no chromatic accent) so the photography carries the
 * color. `photos` = [{ id, cap, tags[], src }]; `tags` = [{ tag, count }].
 */
export default function GalleryHall({ title, subtitle, lede, photos = [], tags = [] }) {
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
          {subtitle ? <p className="gx-eyebrow">{subtitle}</p> : null}
          <h1 className="gx-hall-title">{title}</h1>
          {lede ? <p className="gx-hall-lede">{lede}</p> : null}
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
          list={visible}
          index={Math.min(lbIndex, visible.length - 1)}
          setIndex={setLbIndex}
          catOf={catOf}
          onClose={() => setLbIndex(null)}
        />
      ) : null}
    </section>
  );
}

function Lightbox({ list, index, setIndex, catOf, onClose }) {
  useBodyScrollLock(true);
  const go = (d) => setIndex((i) => (i + d + list.length) % list.length);

  // Touch swipe (mobile): horizontal drag on the image navigates; a tap on the
  // surrounding scrim still closes (its onClick is untouched).
  const touchStartX = useRef(null);
  const onTouchStart = (e) => {
    touchStartX.current = e.changedTouches[0].clientX;
  };
  const onTouchEnd = (e) => {
    if (touchStartX.current == null || list.length < 2) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list]);

  const p = list[index];
  if (!p) return null;
  const cat = catOf(p);

  return (
    <div className="gx-lb" role="dialog" aria-modal="true" aria-label={p.cap}>
      <div className="gx-lb-scrim" onClick={onClose} />
      <button className="gx-lb-x" aria-label="Close" onClick={onClose}>×</button>

      <div className="gx-lb-inner" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="gx-lb-frame" key={index}>
          {p.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="gx-lb-img" src={p.src} alt={p.cap} draggable={false} />
          ) : (
            <div className="gx-lb-img gx-img--empty" aria-hidden="true" />
          )}
        </div>
        <div className="gx-lb-cap">
          {cat ? <span className="gx-lb-cat">{cat}</span> : null}
          <h2 className="gx-lb-title">{p.cap}</h2>
          <div className="gx-lb-controls">
            {list.length > 1 ? (
              <button className="gx-lb-arrow" aria-label="Previous photo" onClick={() => go(-1)}>‹</button>
            ) : null}
            <span className="gx-lb-count">{index + 1} / {list.length}</span>
            {list.length > 1 ? (
              <button className="gx-lb-arrow" aria-label="Next photo" onClick={() => go(1)}>›</button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

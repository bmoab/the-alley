"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import PhotoSlot from "@/components/site/PhotoSlot.js";
import { useBodyScrollLock } from "@/components/hooks.js";

/**
 * The Gallery as an immersive exhibition hall: a dark salon wall with a
 * cursor-tracking spotlight, 3D-tilt framed photos, tag filter chips, and a
 * cinematic keyboard-navigable lightbox over the currently filtered set.
 *
 * `photos` = [{ id, cap, tags[], variant, ar, src }]; `tags` = [{ tag, count }].
 */
export default function GalleryHall({ title, subtitle, note, photos = [], tags = [] }) {
  const [filter, setFilter] = useState("All");
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const wallRef = useRef(null);

  const list = filter === "All" ? photos : photos.filter((p) => p.tags.includes(filter));
  const openAt = (i) => {
    setIndex(i);
    setOpen(true);
  };
  const pickFilter = (t) => {
    setOpen(false);
    setFilter(t);
  };

  const onWallMove = (e) => {
    const el = wallRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--sx", (((e.clientX - r.left) / r.width) * 100).toFixed(1) + "%");
    el.style.setProperty("--sy", (((e.clientY - r.top) / r.height) * 100).toFixed(1) + "%");
  };

  return (
    <section className="gx-hall" ref={wallRef} onMouseMove={onWallMove}>
      <div className="gx-rail" aria-hidden="true" />
      <div className="gx-hall-inner wrap">
        <header className="gx-hall-head">
          <div>
            <p className="gx-eyebrow">{subtitle}</p>
            <h2 className="gx-hall-title">{title}</h2>
          </div>
          {note ? <p className="gx-hall-note">{note}</p> : null}
        </header>

        <div className="gx-filters" role="group" aria-label="Filter photos by tag">
          <button className={"gx-chip mono" + (filter === "All" ? " is-on" : "")} onClick={() => pickFilter("All")}>
            All <span className="gx-chip-n">{photos.length}</span>
          </button>
          {tags.map(({ tag, count }) => (
            <button key={tag} className={"gx-chip mono" + (filter === tag ? " is-on" : "")} onClick={() => pickFilter(tag)}>
              {tag} <span className="gx-chip-n">{count}</span>
            </button>
          ))}
        </div>

        {list.length ? (
          <div className="gx-wall" key={filter}>
            {list.map((photo, i) => (
              <WallPhoto key={photo.id} photo={photo} n={photos.indexOf(photo) + 1} pos={i} onOpen={openAt} />
            ))}
          </div>
        ) : (
          <p className="gx-empty">No photos here yet — check back soon.</p>
        )}

        <footer className="gx-hall-foot">
          <p className="mono">
            Open during building hours · New photos as events happen ·{" "}
            <Link href="/contact" className="gx-foot-link">Tag us @thealleyoncenter</Link>
          </p>
          <Link className="btn btn--verde" href="/spaces">
            Make the next photo yours <span className="arrow" style={{ marginLeft: 6 }}>→</span>
          </Link>
        </footer>
      </div>

      {open ? (
        <Lightbox list={list} index={Math.min(index, list.length - 1)} setIndex={setIndex} onClose={() => setOpen(false)} />
      ) : null}
    </section>
  );
}

function WallPhoto({ photo, n, pos, onOpen }) {
  const ref = useRef(null);
  const raf = useRef(0);

  const onMove = (e) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      el.style.setProperty("--rx", (py * -7).toFixed(2) + "deg");
      el.style.setProperty("--ry", (px * 9).toFixed(2) + "deg");
      el.style.setProperty("--lx", ((px + 0.5) * 100).toFixed(1) + "%");
      el.style.setProperty("--ly", ((py + 0.5) * 100).toFixed(1) + "%");
    });
  };
  const reset = () => {
    const el = ref.current;
    if (!el) return;
    cancelAnimationFrame(raf.current);
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  };

  return (
    <figure
      ref={ref}
      className="gx-piece"
      style={{ "--ar": photo.ar, animationDelay: Math.min(pos, 7) * 55 + "ms" }}
      onMouseMove={onMove}
      onMouseLeave={reset}
      onClick={() => onOpen(pos)}
      tabIndex={0}
      role="button"
      aria-label={`${photo.cap} — view larger`}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen(pos))}
    >
      <div className="gx-frame">
        <div className="gx-art">
          <PhotoSlot src={photo.src || null} tag={photo.tags[0]} variant={photo.variant} className="gx-photo" />
          <span className="gx-gloss" aria-hidden="true" />
        </div>
        <figcaption className="gx-cap">
          <span className="gx-cap-text">{photo.cap}</span>
          {photo.tags[0] ? <span className="gx-cap-tag mono">{photo.tags[0]}</span> : null}
        </figcaption>
      </div>
      <span className="gx-num mono">{String(n).padStart(2, "0")}</span>
    </figure>
  );
}

function Lightbox({ list, index, setIndex, onClose }) {
  useBodyScrollLock(true);
  const go = (d) => setIndex((i) => (i + d + list.length) % list.length);

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

  return (
    <div className="gx-lb" role="dialog" aria-modal="true" aria-label={p.cap}>
      <div className="gx-lb-scrim" onClick={onClose} />
      <button className="gx-lb-x" aria-label="Close" onClick={onClose}>×</button>
      <button className="gx-lb-nav gx-lb-prev" aria-label="Previous photo" onClick={() => go(-1)}>‹</button>
      <button className="gx-lb-nav gx-lb-next" aria-label="Next photo" onClick={() => go(1)}>›</button>

      <div className="gx-lb-stage">
        <div className="gx-lb-frame" key={index}>
          <PhotoSlot src={p.src || null} tag={p.tags[0]} variant={p.variant} className="gx-lb-photo" />
        </div>
        <aside className="gx-lb-cap" key={"c" + index}>
          <span className="gx-lb-count mono">
            {String(index + 1).padStart(2, "0")} / {String(list.length).padStart(2, "0")}
          </span>
          <h3 className="gx-lb-title">{p.cap}</h3>
          <div className="gx-lb-tags">
            {p.tags.map((t) => <span key={t} className="gx-lb-tag mono">{t}</span>)}
          </div>
          <p className="gx-lb-foot mono">Photographed at The Alley On Center · Logan, Utah</p>
          <Link className="gx-lb-cta" href="/spaces">Host your own here <span className="arrow">→</span></Link>
        </aside>
      </div>

      <div className="gx-strip">
        {list.map((t, i) => (
          <button key={t.id} className={"gx-thumb" + (i === index ? " is-on" : "")} aria-label={t.cap} onClick={() => setIndex(i)}>
            <PhotoSlot src={t.src || null} tag="" variant={t.variant} showTag={false} />
          </button>
        ))}
      </div>
    </div>
  );
}

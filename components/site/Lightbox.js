"use client";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useBodyScrollLock } from "@/components/hooks.js";

/**
 * Full-screen photo viewer: arrow keys, on-screen arrows, touch swipe, Esc or a
 * scrim click to close, and an "n / total" counter. `photos` are
 * `{ src, cap, cat }`; `index` is the one showing and `setIndex` accepts a
 * functional update (so the caller can hold it in state).
 *
 * **Portaled to <body> on purpose.** It used to render inline inside the
 * gallery, which was fine there — but a `position: fixed` element inside a
 * CSS-transformed ancestor is positioned against that ancestor instead of the
 * viewport, and the past-exhibitor cards are 3D flip transforms. Portaling
 * keeps it genuinely full-screen wherever it's opened from, and stops its
 * clicks bubbling into whatever opened it (the flip card would flip back).
 */
export default function Lightbox({ photos = [], index = 0, setIndex, onClose, label = "" }) {
  useBodyScrollLock(true);
  const go = (d) => setIndex((i) => (i + d + photos.length) % photos.length);

  // Touch swipe (mobile): horizontal drag on the image navigates; a tap on the
  // surrounding scrim still closes (its onClick is untouched).
  const touchStartX = useRef(null);
  const onTouchStart = (e) => {
    touchStartX.current = e.changedTouches[0].clientX;
  };
  const onTouchEnd = (e) => {
    if (touchStartX.current == null || photos.length < 2) return;
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
  }, [photos]);

  const p = photos[index];
  // No document during SSR; this only ever renders from a click, but guard anyway.
  if (!p || typeof document === "undefined") return null;

  return createPortal(
    <div className="gx-lb" role="dialog" aria-modal="true" aria-label={p.cap || label}>
      <div className="gx-lb-scrim" onClick={onClose} />
      <button className="gx-lb-x" aria-label="Close" onClick={onClose}>×</button>

      <div className="gx-lb-inner" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="gx-lb-frame" key={index}>
          {p.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="gx-lb-img" src={p.src} alt={p.cap || ""} draggable={false} />
          ) : (
            <div className="gx-lb-img gx-img--empty" aria-hidden="true" />
          )}
        </div>
        <div className="gx-lb-cap">
          {p.cat ? <span className="gx-lb-cat">{p.cat}</span> : null}
          {p.cap ? <h2 className="gx-lb-title">{p.cap}</h2> : null}
          <div className="gx-lb-controls">
            {photos.length > 1 ? (
              <button className="gx-lb-arrow" aria-label="Previous photo" onClick={() => go(-1)}>‹</button>
            ) : null}
            <span className="gx-lb-count">{index + 1} / {photos.length}</span>
            {photos.length > 1 ? (
              <button className="gx-lb-arrow" aria-label="Next photo" onClick={() => go(1)}>›</button>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

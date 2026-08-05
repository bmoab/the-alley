"use client";
import { useState } from "react";
import PhotoSlot from "@/components/site/PhotoSlot.js";
import Lightbox from "@/components/site/Lightbox.js";

/**
 * A space's (or tenant's) photo gallery: a main image plus a thumbnail strip
 * that swaps it. Shows ONLY the real uploaded photos ([{ image_path, caption }],
 * first = lead). If none are uploaded yet, shows a single styled placeholder
 * with no strip.
 *
 * The main image opens a full-screen lightbox you can flip through — a 400px
 * frame is a preview, not a look at the room. Thumbnails keep their swap
 * behaviour so you can still browse in place without leaving the page.
 */
export default function SpaceGallery({ photos = [], lead = "verde", label = "" }) {
  const real = photos.filter((p) => p.image_path);
  const shots = real.length
    ? real.map((p) => ({ src: p.image_path, tag: p.caption || "", variant: lead }))
    : [{ src: null, tag: "", variant: lead }];

  const [sel, setSel] = useState(0);
  const [lbIndex, setLbIndex] = useState(null); // null = closed
  const index = Math.min(sel, shots.length - 1);
  const cur = shots[index];

  return (
    <div className="space-gallery">
      {cur.src ? (
        <button
          type="button"
          className="photo-open space-photo-open"
          aria-label={cur.tag ? `View ${cur.tag} full size` : "View this photo full size"}
          onClick={() => setLbIndex(index)}
        >
          <PhotoSlot src={cur.src} tag={cur.tag} variant={cur.variant} className="space-photo" />
        </button>
      ) : (
        // Nothing uploaded yet — the placeholder isn't worth enlarging.
        <PhotoSlot src={null} tag={cur.tag} variant={cur.variant} className="space-photo" />
      )}

      {shots.length > 1 ? (
        <div className="space-thumbs">
          {shots.map((g, i) => (
            <button
              key={i}
              type="button"
              className={"space-thumb" + (i === sel ? " is-on" : "")}
              onClick={() => setSel(i)}
              aria-label={`View ${g.tag || "photo " + (i + 1)}`}
              aria-pressed={i === sel}
            >
              <PhotoSlot src={g.src || null} tag="" variant={g.variant} showTag={false} />
            </button>
          ))}
        </div>
      ) : null}

      {lbIndex != null ? (
        <Lightbox
          photos={shots.map((g) => ({ src: g.src, cap: g.tag, cat: label }))}
          index={Math.min(lbIndex, shots.length - 1)}
          // Keep the in-page main image in step with the lightbox, so closing
          // leaves you on the photo you were actually looking at.
          setIndex={(next) => {
            setLbIndex((i) => {
              const resolved = typeof next === "function" ? next(i) : next;
              setSel(resolved);
              return resolved;
            });
          }}
          onClose={() => setLbIndex(null)}
        />
      ) : null}
    </div>
  );
}

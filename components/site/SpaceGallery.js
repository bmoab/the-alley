"use client";
import { useState } from "react";
import PhotoSlot from "@/components/site/PhotoSlot.js";

/**
 * A space's photo gallery: a main image plus a thumbnail strip that swaps it.
 *
 * `photos` is the real uploaded set ([{ image_path, caption }], first = lead).
 * When present it drives the gallery. Otherwise falls back to the optional
 * single `image` + the decorative `gallery` placeholders ({ tag, variant }).
 */
export default function SpaceGallery({ photos = [], image, gallery = [], lead = "verde" }) {
  const real = photos.filter((p) => p.image_path);
  const shots = real.length
    ? real.map((p) => ({ src: p.image_path, tag: p.caption || "", variant: lead }))
    : (gallery.length ? gallery : [{ tag: "", variant: lead }]).map((g, i) => ({
        // Fallback: show the legacy single lead image on the first slot.
        src: i === 0 ? image || null : null,
        tag: g.tag,
        variant: g.variant,
      }));

  const [sel, setSel] = useState(0);
  const cur = shots[Math.min(sel, shots.length - 1)];

  return (
    <div className="space-gallery">
      <PhotoSlot src={cur.src || null} tag={cur.tag} variant={cur.variant} className="space-photo" />
      {shots.length > 1 ? (
        <div className="space-thumbs">
          {shots.map((g, i) => (
            <button
              key={i}
              type="button"
              className={"space-thumb" + (i === sel ? " is-on" : "")}
              onClick={() => setSel(i)}
              aria-label={`View ${g.tag || "photo " + (i + 1)}`}
            >
              <PhotoSlot src={g.src || null} tag="" variant={g.variant} showTag={false} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

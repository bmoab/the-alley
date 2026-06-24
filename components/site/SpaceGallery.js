"use client";
import { useState } from "react";
import PhotoSlot from "@/components/site/PhotoSlot.js";

/**
 * A space's photo gallery: a main image plus a thumbnail strip that swaps it.
 * Shows ONLY the real uploaded photos ([{ image_path, caption }], first = lead).
 * If none are uploaded yet, shows a single styled placeholder with no strip.
 */
export default function SpaceGallery({ photos = [], lead = "verde" }) {
  const real = photos.filter((p) => p.image_path);
  const shots = real.length
    ? real.map((p) => ({ src: p.image_path, tag: p.caption || "", variant: lead }))
    : [{ src: null, tag: "", variant: lead }];

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

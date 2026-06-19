"use client";
import { useState } from "react";
import PhotoSlot from "@/components/site/PhotoSlot.js";

/**
 * A space's photo gallery: a main image plus a thumbnail strip that swaps it.
 * `image` is the (optional) real uploaded lead photo; `gallery` is a list of
 * { tag, variant } placeholder shots shown until the owner uploads real ones.
 */
export default function SpaceGallery({ image, gallery = [], lead = "verde" }) {
  const shots = gallery.length ? gallery : [{ tag: "", variant: lead }];
  const [sel, setSel] = useState(0);
  const cur = shots[Math.min(sel, shots.length - 1)];
  // The first shot shows the real lead image when one exists.
  const mainSrc = sel === 0 ? image : null;

  return (
    <div className="space-gallery">
      <PhotoSlot src={mainSrc || null} tag={cur.tag} variant={cur.variant} className="space-photo" />
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
              <PhotoSlot src={i === 0 ? image : null} tag="" variant={g.variant} showTag={false} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

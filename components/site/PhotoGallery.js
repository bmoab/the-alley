"use client";
import { useState } from "react";
import PhotoSlot from "@/components/site/PhotoSlot.js";
import Lightbox from "@/components/site/Lightbox.js";

/**
 * A grid of uploaded photos where every tile opens a full-screen, flip-through
 * lightbox. Built for work people came to LOOK at — a 130px thumbnail doesn't
 * showcase a painting.
 *
 * `photos` are `{ src, cap }`; empty ones are dropped, and nothing renders if
 * none are left. `className` / `tileClassName` let the caller keep whatever
 * grid CSS the surrounding layout already has (`.ex-works` / `.ex-work` etc.),
 * and `variants` cycles the placeholder tint like the static markup did.
 *
 * Clicks and Enter/Space are stopped at the tile: these grids sometimes sit
 * inside another interactive element (the past-exhibitor flip card is itself a
 * button), and opening a photo must not also trigger that.
 */
export default function PhotoGallery({
  photos = [],
  className = "",
  tileClassName = "",
  variants = ["verde", "", "soft"],
  cat = "",
  // -1 when the grid is present but face-down (the flip card's back):
  // backface-visibility hides it visually, it does NOT take it out of the tab
  // order, so without this you can tab into photos you can't see.
  tabIndex = 0,
}) {
  const [index, setIndex] = useState(null);
  const shots = photos.filter((p) => p && p.src).map((p) => ({ ...p, cat: p.cat ?? cat }));
  if (!shots.length) return null;

  return (
    <>
      <div className={className}>
        {shots.map((p, i) => (
          <button
            key={i}
            type="button"
            className={"photo-open " + tileClassName}
            tabIndex={tabIndex}
            aria-label={p.cap ? `View ${p.cap} full size` : `View photo ${i + 1} full size`}
            onClick={(e) => {
              e.stopPropagation();
              setIndex(i);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") e.stopPropagation();
            }}
          >
            <PhotoSlot src={p.src} tag={p.cap || ""} variant={variants[i % variants.length]} />
          </button>
        ))}
      </div>

      {index != null ? (
        <Lightbox
          photos={shots}
          index={Math.min(index, shots.length - 1)}
          setIndex={setIndex}
          onClose={() => setIndex(null)}
        />
      ) : null}
    </>
  );
}

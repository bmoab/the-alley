"use client";
import { useState } from "react";
import Lightbox from "@/components/site/Lightbox.js";

/**
 * Event flyer for the public event page. Unlike the cover-cropped PhotoSlot,
 * this shows the WHOLE flyer (portrait posters were getting their top and
 * bottom cut off) and opens the shared full-screen lightbox on click so
 * attendees can actually read it. Falls back to nothing when there's no image —
 * the page keeps its placeholder.
 *
 * It used to carry its own inline copy of a lightbox; it now uses the same one
 * as the gallery and exhibitor photos so enlarging a photo behaves identically
 * everywhere on the site.
 */
export default function EventPhoto({ src, alt = "", caption = "" }) {
  const [open, setOpen] = useState(false);
  if (!src) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="View full flyer"
        style={{
          display: "block",
          width: "100%",
          padding: 0,
          border: "1px solid var(--line)",
          borderRadius: 12,
          overflow: "hidden",
          background: "var(--paper-dim, #efeae0)",
          cursor: "zoom-in",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          loading="lazy"
          style={{
            display: "block",
            width: "100%",
            height: "auto",
            maxHeight: "80vh",
            objectFit: "contain",
          }}
        />
      </button>

      {open ? (
        <Lightbox
          photos={[{ src, cap: alt, cat: caption }]}
          index={0}
          setIndex={() => {}}
          onClose={() => setOpen(false)}
          label="Event flyer"
        />
      ) : null}
    </>
  );
}

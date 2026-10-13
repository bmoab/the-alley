"use client";
import { useState } from "react";
import Lightbox from "@/components/site/Lightbox.js";

/**
 * The event page's pictures: the flyer photo and every page of any PDF the host
 * attached (rendered to images on the server — lib/pdf-preview.js), all shown
 * the same way. The first is shown WHOLE (portrait posters were getting their
 * top and bottom cut off); the rest sit beneath it as thumbnails. Any of them
 * opens the shared full-screen lightbox, where you can swipe through them all.
 *
 * `photos` = [{ src, alt }]. Renders nothing when there are none — the page
 * keeps its placeholder.
 */
export default function EventPhoto({ photos = [], caption = "" }) {
  const [open, setOpen] = useState(null);
  const list = photos.filter((p) => p?.src);
  if (!list.length) return null;
  const [first, ...rest] = list;
  const frame = {
    display: "block",
    width: "100%",
    padding: 0,
    border: "1px solid var(--line)",
    borderRadius: 12,
    overflow: "hidden",
    background: "var(--paper-dim, #efeae0)",
    cursor: "zoom-in",
  };

  return (
    <div>
      <button type="button" onClick={() => setOpen(0)} aria-label="View full flyer" style={frame}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={first.src}
          alt={first.alt || ""}
          style={{ display: "block", width: "100%", height: "auto", maxHeight: "80vh", objectFit: "contain" }}
        />
      </button>

      {rest.length ? (
        <div style={{ marginTop: 10, display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))" }}>
          {rest.map((p, i) => (
            <button
              key={p.src}
              type="button"
              onClick={() => setOpen(i + 1)}
              aria-label={`View ${p.alt || `picture ${i + 2}`}`}
              style={{ ...frame, borderRadius: 8, aspectRatio: "3 / 4" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.src} alt={p.alt || ""} loading="lazy" style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
            </button>
          ))}
        </div>
      ) : null}

      {open != null ? (
        <Lightbox
          photos={list.map((p) => ({ src: p.src, cap: p.alt, cat: caption }))}
          index={open}
          setIndex={setOpen}
          onClose={() => setOpen(null)}
          label="Event flyer"
        />
      ) : null}
    </div>
  );
}

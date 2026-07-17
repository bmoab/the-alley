"use client";
import { useEffect, useState } from "react";

/**
 * Event flyer for the public event page. Unlike the cover-cropped PhotoSlot,
 * this shows the WHOLE flyer (portrait posters were getting their top and
 * bottom cut off) and opens a full-screen lightbox on click so attendees can
 * actually read it. Falls back to nothing when there's no image — the page
 * keeps its placeholder.
 */
export default function EventPhoto({ src, alt = "" }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

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
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Event flyer"
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "clamp(16px,4vw,48px)",
            background: "rgba(16,14,12,0.86)",
            cursor: "zoom-out",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
              borderRadius: 8,
              boxShadow: "0 12px 48px rgba(0,0,0,0.5)",
              cursor: "default",
            }}
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            style={{
              position: "fixed",
              top: "max(16px, env(safe-area-inset-top))",
              right: 20,
              width: 44,
              height: 44,
              borderRadius: 999,
              border: "none",
              background: "rgba(255,255,255,0.14)",
              color: "#fff",
              fontSize: 22,
              lineHeight: 1,
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>
      ) : null}
    </>
  );
}

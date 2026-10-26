"use client";
import { useState } from "react";
import CropModal from "@/components/CropModal.js";
import { startBox, isWholePhoto } from "@/lib/crop.js";

// Load an image just to read its natural pixel size.
function loadNatural(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ nw: img.naturalWidth, nh: img.naturalHeight });
    img.onerror = () => reject(new Error("Couldn't read that photo."));
    img.src = src;
  });
}

/**
 * "Crop" for one photo in the Pages editor: opens the crop window and reports
 * the box through onChange (null = no crop, the whole photo). `aspect` locks
 * the box's shape (1 for a round portrait); leave it out for any shape.
 */
export default function CropButton({ src, crop, onChange, aspect = null, title, help, className = "" }) {
  const [nat, setNat] = useState(null);
  const [error, setError] = useState("");

  async function open() {
    setError("");
    try {
      setNat(await loadNatural(src));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <span className={`inline-flex flex-wrap items-center gap-3 ${className}`}>
      <button
        type="button"
        onClick={open}
        className="rounded-full border border-ink bg-ink px-3 py-1 text-xs font-semibold text-paper hover:opacity-90"
      >
        {crop ? "Adjust crop" : "Crop"}
      </button>
      {crop ? (
        <button type="button" onClick={() => onChange(null)} className="text-xs font-semibold text-ink-muted hover:text-ink hover:underline">
          Undo crop
        </button>
      ) : null}
      {error ? <span className="text-xs text-rust">{error}</span> : null}
      {nat ? (
        <CropModal
          src={src}
          nat={nat}
          initial={crop && crop.nw === nat.nw && crop.nh === nat.nh ? crop : startBox(nat.nw, nat.nh, aspect)}
          onCancel={() => setNat(null)}
          onSave={(box) => {
            onChange(isWholePhoto(box) ? null : box);
            setNat(null);
          }}
          title={title}
          help={help}
          minAspect={aspect || 0.25}
          maxAspect={aspect || 6}
        />
      ) : null}
    </span>
  );
}

"use client";
import { useState } from "react";

/**
 * An optional photo of one item: a small square that uploads straight away
 * (/api/upload, which shrinks it) and hands back the saved path. Tap the
 * photo to change it; × takes it off.
 */
export default function PhotoPick({ value, onChange, label = "Photo", size = 44 }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", "image");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "That photo didn't upload.");
      onChange(data.path);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="relative inline-flex shrink-0 flex-col items-center" style={{ width: size }}>
      <label
        className="flex cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed border-line-strong bg-paper-warm text-[10px] font-semibold leading-tight text-ink-muted hover:border-ink-muted hover:text-ink"
        style={{ width: size, height: size }}
        title={value ? "Change the photo" : "Add a photo (optional)"}
      >
        {busy ? (
          "…"
        ) : value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt={label} className="h-full w-full object-cover" />
        ) : (
          <span className="px-1 text-center">+ Photo</span>
        )}
        <input type="file" accept="image/*" onChange={pick} className="sr-only" aria-label={value ? `Change ${label}` : `Add ${label}`} disabled={busy} />
      </label>
      {value && !busy ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label={`Remove ${label}`}
          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[11px] leading-none text-paper"
        >
          ×
        </button>
      ) : null}
      {error ? <span className="mt-1 w-28 text-[10px] leading-tight text-rust">{error}</span> : null}
    </span>
  );
}

"use client";
import { useEffect, useState } from "react";
import { cropBackgroundStyle, parseCrop, defaultCrop, HERO_MIN_ASPECT, HERO_MAX_ASPECT } from "@/lib/crop.js";
import CropModal from "./CropModal.js";

async function uploadFile(file) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("kind", "image");
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return data.path;
}

// Load an image just to read its natural pixel size.
function loadNatural(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ nw: img.naturalWidth, nh: img.naturalHeight });
    img.onerror = () => reject(new Error("Could not read the image"));
    img.src = src;
  });
}

export default function ImageCropField({ name, label, hint, value = "", crop: cropValue = "" }) {
  const [path, setPath] = useState(value || "");
  const [crop, setCrop] = useState(() => parseCrop(cropValue));
  const [nat, setNat] = useState(() => {
    const c = parseCrop(cropValue);
    return c ? { nw: c.nw, nh: c.nh } : null;
  });
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  // Learn the photo's natural size. A photo that was never framed stays
  // unframed (no crop is saved for it) until someone adjusts it, so opening the
  // editor never changes what the site shows by itself.
  useEffect(() => {
    let cancelled = false;
    if (!path) {
      setNat(null);
      setCrop(null);
      return;
    }
    if (nat) return;
    loadNatural(path)
      .then(({ nw, nh }) => {
        if (cancelled) return;
        setNat({ nw, nh });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [path]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onPick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const p = await uploadFile(file);
      const { nw, nh } = await loadNatural(p);
      setPath(p);
      setNat({ nw, nh });
      setCrop(defaultCrop(nw, nh)); // fresh photo → fresh framing
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="card p-5">
      <label className="label">{label}</label>
      {hint ? <p className="mb-2 text-xs text-ink-muted">{hint}</p> : null}

      <input type="hidden" name={name} value={path} />
      <input type="hidden" name={`${name}_crop`} value={crop ? JSON.stringify(crop) : ""} />

      {path ? (
        crop ? (
          <div
            className="mb-3 w-full overflow-hidden rounded-lg"
            style={cropBackgroundStyle(path, crop)}
            role="img"
            aria-label={`${label} preview`}
            data-crop-preview
          />
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={path} alt={`${label} preview`} className="mb-2 w-full rounded-lg" />
            <p className="mb-3 text-xs text-ink-muted">Not framed yet. Tap &ldquo;Adjust crop&rdquo; to choose exactly what shows.</p>
          </>
        )
      ) : (
        <div className="mb-3 flex h-40 w-full items-center justify-center rounded-lg bg-paper-warm text-sm text-ink-muted">
          No image yet — a placeholder shows on the site.
        </div>
      )}

      {path && crop ? (
        <p className="mb-2 text-xs text-ink-muted">
          This is exactly what shows on the homepage. Drag the box to reframe or resize it.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer items-center rounded-lg border border-line-strong bg-paper px-3 py-1.5 text-sm font-semibold text-ink-soft hover:text-ink">
          {uploading ? "Uploading…" : path ? "Change photo" : "Upload a photo"}
          <input type="file" accept="image/*" onChange={onPick} className="hidden" />
        </label>
        {path && nat ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-full border border-ink bg-ink px-3 py-1 text-xs font-semibold text-paper hover:opacity-90"
          >
            Adjust crop
          </button>
        ) : null}
        {path ? (
          <button
            type="button"
            onClick={() => {
              setPath("");
              setCrop(null);
              setNat(null);
            }}
            className="text-xs font-semibold text-rust hover:underline"
          >
            Remove
          </button>
        ) : null}
      </div>
      {uploading ? <p className="mt-1 text-xs text-ink-muted">Uploading…</p> : null}
      {error ? <p className="mt-1 text-xs text-rust">{error}</p> : null}

      {open && path && nat ? (
        <CropModal
          src={path}
          nat={nat}
          initial={crop || defaultCrop(nat.nw, nat.nh)}
          onCancel={() => setOpen(false)}
          onSave={(c) => {
            setCrop(c);
            setOpen(false);
          }}
          title="Frame the homepage banner"
          help="Drag inside the box to move it. Drag the top or bottom handle to make the banner taller or shorter, or a corner to resize. Only what's inside the box shows on the homepage — the box's shape sets the banner's height."
          minAspect={HERO_MIN_ASPECT}
          maxAspect={HERO_MAX_ASPECT}
        />
      ) : null}
    </div>
  );
}

"use client";
import { useRef, useState } from "react";

async function uploadFile(file) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("kind", "image");
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return data.path;
}

const HEIGHTS = [
  { label: "Short", px: 300 },
  { label: "Medium", px: 440 },
  { label: "Tall", px: 560 },
];

/**
 * Upload + frame a single site image. Beyond the path (hidden input `name`), it
 * optionally captures how the photo should be shown on the site:
 *   - `${name}_fit`  cover | contain   ("show the whole photo" = contain)
 *   - `${name}_pos`  "x% y%"           focal point kept in view when cropping
 *   - `${name}_h`    px                banner height (framing + height only)
 * The live preview mirrors the site so the owner sees the actual crop. Lives
 * inside a server-component form; all values post via hidden inputs.
 */
export default function ContentImageField({
  name,
  label,
  hint,
  value = "",
  framing = false,
  height = false,
  pos = "50% 50%",
  fit = "cover",
  heightPx = 440,
}) {
  const [path, setPath] = useState(value || "");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [objectPos, setObjectPos] = useState(pos || "50% 50%");
  const [whole, setWhole] = useState(fit === "contain");
  const [h, setH] = useState(Number(heightPx) || 440);
  const previewRef = useRef(null);

  const [px, py] = objectPos.split(" ").map((v) => parseFloat(v) || 50);
  const objectFit = whole ? "contain" : "cover";

  async function onPick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      setPath(await uploadFile(file));
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  // Click / drag the preview to set the focal point (only meaningful when the
  // photo is being cropped to fill — "show whole photo" disables it).
  function setFocusFromEvent(e) {
    if (whole || !previewRef.current) return;
    const r = previewRef.current.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100));
    setObjectPos(`${Math.round(x)}% ${Math.round(y)}%`);
  }

  return (
    <div className="card p-5">
      <label className="label">{label}</label>
      {hint ? <p className="mb-2 text-xs text-ink-muted">{hint}</p> : null}

      <input type="hidden" name={name} value={path} />
      {framing ? (
        <>
          <input type="hidden" name={`${name}_fit`} value={objectFit} />
          <input type="hidden" name={`${name}_pos`} value={objectPos} />
        </>
      ) : null}
      {height ? <input type="hidden" name={`${name}_h`} value={h} /> : null}

      {path ? (
        <div
          ref={previewRef}
          onPointerDown={framing ? (e) => { e.currentTarget.setPointerCapture?.(e.pointerId); setFocusFromEvent(e); } : undefined}
          onPointerMove={framing ? (e) => { if (e.buttons === 1) setFocusFromEvent(e); } : undefined}
          className="relative mb-3 w-full overflow-hidden rounded-lg bg-paper-warm"
          style={{
            // Preview at the site's shape: for the banner use the chosen height
            // (scaled down a touch), else a standard 10rem strip.
            height: height ? Math.round((Number(h) || 440) * 0.42) : 160,
            cursor: framing && !whole ? "crosshair" : "default",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={path}
            alt={`${label} preview`}
            className="h-full w-full select-none"
            draggable={false}
            style={{ objectFit, objectPosition: objectPos }}
          />
          {framing && !whole ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
              style={{ left: `${px}%`, top: `${py}%`, boxShadow: "0 0 0 2px rgba(0,0,0,.35)" }}
            />
          ) : null}
        </div>
      ) : (
        <div className="mb-3 flex h-40 w-full items-center justify-center rounded-lg bg-paper-warm text-sm text-ink-muted">
          No image yet — a placeholder shows on the site.
        </div>
      )}

      {path && framing ? (
        <div className="mb-3 space-y-2">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={whole}
              onChange={(e) => setWhole(e.target.checked)}
              className="h-4 w-4 accent-verde-deep"
            />
            Show the whole photo (no cropping)
          </label>
          {!whole ? (
            <p className="text-xs text-ink-muted">
              Click or drag on the photo above to choose what stays in view.
            </p>
          ) : null}
          {height ? (
            <div className="flex items-center gap-2 pt-1">
              <span className="text-xs text-ink-muted">Height on site:</span>
              {HEIGHTS.map((opt) => (
                <button
                  key={opt.px}
                  type="button"
                  onClick={() => setH(opt.px)}
                  className={
                    "rounded-full border px-3 py-1 text-xs font-semibold transition " +
                    (Number(h) === opt.px
                      ? "border-ink bg-ink text-paper"
                      : "border-line text-ink-soft hover:bg-paper-dim")
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <input type="file" accept="image/*" onChange={onPick} className="block text-sm" />
        {path ? (
          <button
            type="button"
            onClick={() => setPath("")}
            className="text-xs font-semibold text-rust hover:underline"
          >
            Remove
          </button>
        ) : null}
      </div>
      {uploading ? <p className="mt-1 text-xs text-ink-muted">Uploading…</p> : null}
      {error ? <p className="mt-1 text-xs text-rust">{error}</p> : null}
    </div>
  );
}

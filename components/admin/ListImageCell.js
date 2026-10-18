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

/**
 * A photo inside a list item (a founder's portrait, say). The preview is the
 * same size and shape as on the site — `shape` "circle" is the About page's
 * 88px round portrait — and clicking or dragging on it picks what stays in
 * view. Reports { path, pos } through onChange; the list stores them.
 */
export default function ListImageCell({ path = "", pos = "50% 50%", shape = "circle", onChange }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef(null);
  const [px, py] = String(pos || "50% 50%").split(" ").map((v) => parseFloat(v) || 50);

  async function onPick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      onChange({ path: await uploadFile(file), pos: "50% 50%" });
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  function focusFrom(e) {
    if (!ref.current || !path) return;
    const r = ref.current.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100));
    onChange({ path, pos: `${Math.round(x)}% ${Math.round(y)}%` });
  }

  return (
    <div className="flex items-center gap-4">
      <div
        ref={ref}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          focusFrom(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) focusFrom(e);
        }}
        className={`relative h-[88px] w-[88px] shrink-0 overflow-hidden bg-paper-warm ${shape === "circle" ? "rounded-full" : "rounded-lg"}`}
        style={{ cursor: path ? "crosshair" : "default", touchAction: "none" }}
      >
        {path ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={path} alt="" draggable={false} className="h-full w-full select-none object-cover" style={{ objectPosition: `${px}% ${py}%` }} />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[11px] text-ink-muted">No photo</span>
        )}
      </div>
      <div className="min-w-0 space-y-1 text-xs text-ink-muted">
        <label className="inline-flex cursor-pointer items-center rounded-lg border border-line-strong px-3 py-1.5 font-semibold text-ink-soft hover:text-ink">
          {uploading ? "Uploading…" : path ? "Change photo" : "Upload a photo"}
          <input type="file" accept="image/*" onChange={onPick} className="hidden" />
        </label>
        {path ? (
          <>
            <p>Click or drag on the photo to choose what stays in view. This is exactly how it shows on the site.</p>
            <button type="button" onClick={() => onChange({ path: "", pos: "50% 50%" })} className="font-semibold text-rust hover:underline">
              Remove photo
            </button>
          </>
        ) : null}
        {error ? <p className="text-rust">{error}</p> : null}
      </div>
    </div>
  );
}

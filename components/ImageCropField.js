"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cropBackgroundStyle, parseCrop, defaultCrop, resizeCrop } from "@/lib/crop.js";

async function uploadFile(file) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("kind", "image");
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return data.path;
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

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

  // Ensure we know the natural size (and have a default crop) for any path.
  useEffect(() => {
    let cancelled = false;
    if (!path) {
      setNat(null);
      setCrop(null);
      return;
    }
    if (nat && crop) return;
    loadNatural(path)
      .then(({ nw, nh }) => {
        if (cancelled) return;
        setNat({ nw, nh });
        setCrop((prev) => prev || defaultCrop(nw, nh));
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
          <div className="mb-3 flex h-40 w-full items-center justify-center rounded-lg bg-paper-warm text-sm text-ink-muted">
            Reading photo…
          </div>
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
        <input type="file" accept="image/*" onChange={onPick} className="block text-sm" />
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
        />
      ) : null}
    </div>
  );
}

const HANDLES = ["nw", "ne", "sw", "se"];

function CropModal({ src, nat, initial, onCancel, onSave }) {
  const [box, setBox] = useState(initial);
  const [disp, setDisp] = useState({ w: 0, h: 0 });
  const dragRef = useRef(null); // { handle|null, startBox, startX, startY }
  const stageRef = useRef(null);

  // Fit the whole photo into the available modal area.
  useEffect(() => {
    function fit() {
      const maxW = Math.min(620, (window.innerWidth || 620) - 48);
      const maxH = Math.min(460, (window.innerHeight || 460) - 240);
      const scale = Math.min(maxW / nat.nw, maxH / nat.nh);
      setDisp({ w: Math.round(nat.nw * scale), h: Math.round(nat.nh * scale) });
    }
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [nat.nw, nat.nh]);

  const onMove = useCallback(
    (e) => {
      const d = dragRef.current;
      if (!d || !disp.w) return;
      const ddx = (e.clientX - d.startX) / disp.w;
      const ddy = (e.clientY - d.startY) / disp.h;
      if (d.handle) {
        setBox(resizeCrop(d.handle, d.startBox, ddx, ddy, nat.nw, nat.nh));
      } else {
        const x = clamp(d.startBox.x + ddx, 0, 1 - d.startBox.w);
        const y = clamp(d.startBox.y + ddy, 0, 1 - d.startBox.h);
        setBox({ ...d.startBox, x, y });
      }
    },
    [disp.w, disp.h, nat.nw, nat.nh]
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", endDrag);
  }, [onMove]);

  function startDrag(e, handle) {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { handle, startBox: box, startX: e.clientX, startY: e.clientY };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", endDrag);
  }

  useEffect(() => () => endDrag(), [endDrag]);

  const px = {
    left: box.x * disp.w,
    top: box.y * disp.h,
    width: box.w * disp.w,
    height: box.h * disp.h,
  };

  return createPortal(
    <div
      onPointerDown={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(20,16,12,.72)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          background: "var(--paper, #f7f1e6)",
          borderRadius: 16,
          padding: 20,
          maxWidth: "94vw",
          boxShadow: "0 20px 60px rgba(0,0,0,.4)",
        }}
      >
        <h3 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 700 }}>Frame the homepage banner</h3>
        <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--ink-soft, #5b5147)" }}>
          Drag inside the box to move it, or drag a corner to resize. Only what&rsquo;s inside the box
          shows on the homepage — the box&rsquo;s shape also sets the banner&rsquo;s height.
        </p>

        <div
          ref={stageRef}
          data-crop-stage
          style={{
            position: "relative",
            width: disp.w,
            height: disp.h,
            margin: "0 auto",
            userSelect: "none",
            touchAction: "none",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            draggable={false}
            style={{ width: disp.w, height: disp.h, display: "block", borderRadius: 6 }}
          />
          {/* Dim everything outside the box (classic crop mask). */}
          <div
            onPointerDown={(e) => startDrag(e, null)}
            data-crop-box
            style={{
              position: "absolute",
              left: px.left,
              top: px.top,
              width: px.width,
              height: px.height,
              boxShadow: "0 0 0 9999px rgba(20,16,12,.55)",
              outline: "2px solid #fff",
              cursor: "move",
            }}
          >
            {HANDLES.map((h) => (
              <span
                key={h}
                data-handle={h}
                onPointerDown={(e) => startDrag(e, h)}
                style={{
                  position: "absolute",
                  width: 16,
                  height: 16,
                  background: "#fff",
                  border: "1px solid rgba(0,0,0,.4)",
                  borderRadius: 3,
                  top: h[0] === "n" ? -8 : undefined,
                  bottom: h[0] === "s" ? -8 : undefined,
                  left: h[1] === "w" ? -8 : undefined,
                  right: h[1] === "e" ? -8 : undefined,
                  cursor: `${h}-resize`,
                  touchAction: "none",
                }}
              />
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              borderRadius: 999,
              border: "1px solid var(--line, #d8cdbb)",
              background: "transparent",
              padding: "9px 18px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(box)}
            style={{
              borderRadius: 999,
              border: "none",
              background: "var(--ink, #1c1815)",
              color: "var(--paper, #f7f1e6)",
              padding: "9px 20px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Save crop
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

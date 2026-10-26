"use client";
import { useState } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { parseCrop } from "@/lib/crop.js";
import CroppedImg from "@/components/site/CroppedImg.js";
import CropButton from "./CropButton.js";

async function uploadFile(file) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("kind", "image");
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return data.path;
}

function parse(value) {
  try {
    const list = JSON.parse(value || "[]");
    return Array.isArray(list) ? list.filter((p) => p?.path).map((p) => ({ ...p, crop: parseCrop(p.crop) })) : [];
  } catch {
    return [];
  }
}

/**
 * A room's photos in the Pages editor: a small gallery to add, remove, caption
 * and reorder (drag, or the arrows). The FIRST photo is the main one — the big
 * photo on the Spaces page and the room's card on the homepage. Each can be
 * cropped. Posts the list as JSON [{ path, caption, crop }] under `name`; Save
 * writes it to the room.
 */
export default function SpacePhotosField({ name, label, value }) {
  const [photos, setPhotos] = useState(() => parse(value));
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState("");
  const [dragFrom, setDragFrom] = useState(null);
  const [over, setOver] = useState(null);

  const move = (from, to) =>
    setPhotos((list) => {
      if (to < 0 || to >= list.length || from === to) return list;
      const next = [...list];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });

  async function onPick(e) {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (!files.length) return;
    setError("");
    setUploading(files.length);
    for (const file of files) {
      try {
        const path = await uploadFile(file);
        setPhotos((list) => [...list, { path, caption: "", crop: null }]);
      } catch (err) {
        setError(err.message);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  return (
    <div className="card p-5">
      <label className="label">{label}</label>
      <input
        type="hidden"
        name={name}
        value={JSON.stringify(photos.map((p) => ({ path: p.path, caption: p.caption || "", crop: p.crop ? JSON.stringify(p.crop) : "" })))}
      />

      {photos.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((p, i) => (
            <li
              key={`${p.path}-${i}`}
              draggable
              onDragStart={(e) => {
                setDragFrom(i);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (dragFrom == null) return;
                e.preventDefault();
                setOver(i);
              }}
              onDragLeave={() => setOver((o) => (o === i ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFrom != null) move(dragFrom, i);
                setDragFrom(null);
                setOver(null);
              }}
              onDragEnd={() => {
                setDragFrom(null);
                setOver(null);
              }}
              className={`group overflow-hidden rounded-lg border bg-paper ${
                over === i && dragFrom !== i ? "border-verde-deep ring-2 ring-verde/60" : "border-line"
              } ${dragFrom === i ? "opacity-50" : ""}`}
            >
              <div className="relative aspect-[4/3] cursor-grab bg-paper-warm active:cursor-grabbing">
                {p.crop ? (
                  <CroppedImg src={p.path} crop={p.crop} className="h-full w-full select-none" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.path} alt="" draggable={false} className="h-full w-full select-none object-cover" />
                )}
                <div className="absolute inset-x-1 top-1 flex justify-between opacity-100 sm:opacity-0 sm:transition sm:group-hover:opacity-100">
                  <span className="flex gap-1">
                    <IconButton label="Move earlier" onClick={() => move(i, i - 1)} disabled={i === 0}>
                      <ArrowLeft className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton label="Move later" onClick={() => move(i, i + 1)} disabled={i === photos.length - 1}>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </IconButton>
                  </span>
                  <IconButton label="Remove photo" onClick={() => setPhotos((list) => list.filter((_, j) => j !== i))}>
                    <X className="h-3.5 w-3.5" />
                  </IconButton>
                </div>
              </div>
              {i === 0 ? (
                <div className="bg-verde/70 px-2 py-0.5 text-center text-[11px] font-semibold text-verde-deep">Main photo</div>
              ) : (
                <button
                  type="button"
                  onClick={() => move(i, 0)}
                  className="block w-full bg-paper-dim px-2 py-0.5 text-center text-[11px] font-semibold text-ink-soft hover:text-ink"
                >
                  Make main
                </button>
              )}
              <div className="flex justify-center border-t border-line bg-paper px-2 py-1.5">
                <CropButton
                  src={p.path}
                  crop={p.crop}
                  onChange={(crop) => setPhotos((list) => list.map((x, j) => (j === i ? { ...x, crop } : x)))}
                  help="Drag inside the box to move it, or a corner or edge to resize it. Nothing outside the box shows on the Spaces page or the homepage; where a frame is a different shape, the box's edges may be trimmed slightly. The full-size view still shows the whole photo."
                />
              </div>
              <input
                value={p.caption || ""}
                onChange={(e) => {
                  const caption = e.target.value;
                  setPhotos((list) => list.map((x, j) => (j === i ? { ...x, caption } : x)));
                }}
                placeholder="Caption (optional)"
                aria-label={`Caption for photo ${i + 1}`}
                className="w-full border-0 border-t border-line bg-transparent px-2 py-1.5 text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:ring-0"
              />
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex h-28 items-center justify-center rounded-lg bg-paper-warm text-sm text-ink-muted">
          No photos yet. A styled placeholder shows on the site.
        </div>
      )}

      <div className="mt-3 rounded-lg border border-verde/60 bg-verde/20 px-3 py-2 text-xs text-ink-soft">
        <strong className="text-ink">The first photo is the main photo.</strong> It&apos;s the big picture for this room on the
        Spaces page and on its homepage card; the rest show as thumbnails underneath. Drag photos (or use the arrows) to change
        the order.
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer items-center rounded-lg border border-line-strong bg-paper px-3 py-1.5 text-sm font-semibold text-ink-soft hover:text-ink">
          {uploading ? `Uploading ${uploading}…` : "Add photos"}
          <input type="file" accept="image/*" multiple onChange={onPick} className="hidden" />
        </label>
        {error ? <span className="text-xs text-rust">{error}</span> : null}
      </div>
    </div>
  );
}

function IconButton({ label, onClick, disabled, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-paper/90 text-ink shadow-sm hover:bg-paper disabled:opacity-30"
    >
      {children}
    </button>
  );
}

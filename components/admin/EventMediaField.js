"use client";
import { useState } from "react";

async function uploadFile(file, kind) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("kind", kind);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return data.path;
}

/**
 * Flyer/photo + PDF attachments for an event, usable inside the admin's
 * server-component event forms. Uploads happen immediately via /api/upload;
 * the resulting paths post with the form as hidden inputs:
 *   - `photo_path`  the image path, or "" to clear an existing one
 *   - `pdf_paths`   JSON array of paths
 *
 * Hosts have always had this on their own listing page — this is the same
 * capability for events The Alley runs itself, which have no host link.
 */
export default function EventMediaField({ photo = "", pdfs = [] }) {
  const [path, setPath] = useState(photo || "");
  const [files, setFiles] = useState(() => (Array.isArray(pdfs) ? pdfs : []));
  const [uploading, setUploading] = useState("");
  const [error, setError] = useState("");

  async function onPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setUploading("photo");
    try {
      setPath(await uploadFile(file, "image"));
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading("");
      e.target.value = "";
    }
  }

  async function onPdf(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setUploading("pdf");
    try {
      const p = await uploadFile(file, "pdf");
      setFiles((prev) => [...prev, p]);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading("");
      e.target.value = "";
    }
  }

  const pick =
    "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line-strong bg-paper px-3 py-1.5 text-sm font-semibold text-ink-soft transition hover:text-ink";
  return (
    <div className="space-y-4">
      {/* Empty string is meaningful: it tells the server to clear the photo. */}
      <input type="hidden" name="photo_path" value={path} />
      <input type="hidden" name="pdf_paths" value={JSON.stringify(files)} />

      <div>
        <p className="label">Flyer / photo</p>
        {path ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={path} alt="Flyer preview" className="mb-2 h-40 w-full rounded-xl object-cover" />
        ) : (
          <div className="mb-2 flex h-24 w-full items-center justify-center rounded-xl bg-paper-warm text-sm text-ink-muted">
            No photo yet
          </div>
        )}
        <div className="flex items-center gap-3">
          <label className={pick}>
            {uploading === "photo" ? "Uploading…" : path ? "Change photo" : "Add a photo"}
            <input type="file" accept="image/*" onChange={onPhoto} className="hidden" />
          </label>
          {path ? (
            <button type="button" onClick={() => setPath("")} className="text-xs font-semibold text-rust hover:underline">
              Remove
            </button>
          ) : null}
        </div>
      </div>

      <div>
        <p className="label">PDFs (programs, menus, supply lists…)</p>
        {files.length ? (
          <ul className="mb-2 space-y-1.5 text-sm">
            {files.map((p, i) => (
              <li key={p + i} className="flex items-center justify-between gap-3 rounded-lg bg-paper-warm px-3 py-2">
                <a href={p} target="_blank" rel="noreferrer" className="truncate font-semibold text-ink-soft hover:underline">
                  {`PDF ${i + 1}`}
                </a>
                <button
                  type="button"
                  onClick={() => setFiles((arr) => arr.filter((_, j) => j !== i))}
                  className="shrink-0 text-xs font-semibold text-rust hover:underline"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <label className={pick}>
          {uploading === "pdf" ? "Uploading…" : "Add a PDF"}
          <input type="file" accept="application/pdf" onChange={onPdf} className="hidden" />
        </label>
      </div>

      <p className="text-xs text-ink-muted">Uploads go up right away; they&apos;re attached to the event when you save.</p>
      {error ? <p className="text-xs text-rust">{error}</p> : null}
    </div>
  );
}

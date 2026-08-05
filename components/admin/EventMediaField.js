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

  return (
    <div className="rounded-lg border border-line bg-paper-warm p-4">
      {/* Empty string is meaningful: it tells the server to clear the photo. */}
      <input type="hidden" name="photo_path" value={path} />
      <input type="hidden" name="pdf_paths" value={JSON.stringify(files)} />

      <label className="label">Flyer / photo</label>
      {path ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={path} alt="Flyer preview" className="mb-2 h-40 w-full rounded-lg object-cover" />
      ) : (
        <div className="mb-2 flex h-24 w-full items-center justify-center rounded-lg bg-paper text-sm text-ink-muted">
          No photo yet
        </div>
      )}
      <div className="flex items-center gap-3">
        <input type="file" accept="image/*" onChange={onPhoto} className="block text-sm" />
        {path ? (
          <button type="button" onClick={() => setPath("")} className="text-xs font-semibold text-rust hover:underline">
            Remove
          </button>
        ) : null}
      </div>
      {uploading === "photo" ? <p className="mt-1 text-xs text-ink-muted">Uploading…</p> : null}

      <div className="mt-4">
        <label className="label">PDFs (programs, menus, supply lists…)</label>
        {files.length ? (
          <ul className="mb-2 space-y-1 text-sm">
            {files.map((p, i) => (
              <li key={p + i} className="flex items-center justify-between gap-3 rounded bg-paper px-3 py-1.5">
                <a href={p} target="_blank" rel="noreferrer" className="truncate text-ink-soft hover:underline">
                  {p.split("/").pop()}
                </a>
                <button
                  type="button"
                  onClick={() => setFiles((arr) => arr.filter((_, j) => j !== i))}
                  className="shrink-0 text-xs font-semibold text-rust hover:underline"
                >
                  remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <input type="file" accept="application/pdf" onChange={onPdf} className="block text-sm" />
        {uploading === "pdf" ? <p className="mt-1 text-xs text-ink-muted">Uploading…</p> : null}
      </div>

      <p className="mt-2 text-xs text-ink-muted">
        Uploads save as soon as you pick them — then hit Save below to attach them to this event.
      </p>
      {error ? <p className="mt-1 text-xs text-rust">{error}</p> : null}
    </div>
  );
}

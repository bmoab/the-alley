"use client";
import { useState } from "react";

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
 * Upload + manage a single site image (e.g. homepage hero). The resolved path is
 * held in a hidden input named `name`, so it posts with the surrounding content
 * form's server action. Lives inside a server-component form.
 */
export default function ContentImageField({ name, label, hint, value = "" }) {
  const [path, setPath] = useState(value || "");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

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

  return (
    <div className="card p-5">
      <label className="label">{label}</label>
      {hint ? <p className="mb-2 text-xs text-ink-muted">{hint}</p> : null}
      <input type="hidden" name={name} value={path} />
      {path ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={path}
          alt={`${label} preview`}
          className="mb-3 h-40 w-full rounded-lg object-cover"
        />
      ) : (
        <div className="mb-3 flex h-40 w-full items-center justify-center rounded-lg bg-paper-warm text-sm text-ink-muted">
          No image yet — a placeholder shows on the site.
        </div>
      )}
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

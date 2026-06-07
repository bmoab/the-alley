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

export default function DirectoryEditForm({ entry, saveAction }) {
  const [form, setForm] = useState({
    business_name: entry.business_name || "",
    category: entry.category || "",
    description: entry.description || "",
    contact_link: entry.contact_link || "",
  });
  const [photo, setPhoto] = useState(entry.photo_path || "");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  async function onPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      setPhoto(await uploadFile(file, "image"));
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    setError("");
    setBusy(true);
    const res = await saveAction({ ...form, photo_path: photo || null });
    setBusy(false);
    if (res?.ok) setDone(true);
    else setError(res?.error || "Something went wrong.");
  }

  if (done) {
    return (
      <div className="card p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brass/15 text-2xl text-brass-dark">
          ✓
        </div>
        <h2 className="mt-4 font-display text-2xl font-semibold text-ink">
          Listing saved
        </h2>
        <p className="mt-3 text-ink-muted">
          Your changes are live on The Alley directory. You can keep editing from
          this same link anytime.
        </p>
        <button onClick={() => setDone(false)} className="btn-ghost mt-6">
          Keep editing
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error ? (
        <div className="rounded-lg border border-rust/30 bg-rust/10 px-4 py-2 text-sm text-rust">
          {error}
        </div>
      ) : null}

      <div className="card p-5">
        <label className="label">Business name</label>
        <input
          className="field"
          value={form.business_name}
          onChange={(e) => set({ business_name: e.target.value })}
          placeholder="Cache Valley Ceramics"
        />
        <div className="mt-4">
          <label className="label">Category</label>
          <input
            className="field"
            value={form.category}
            onChange={(e) => set({ category: e.target.value })}
            placeholder="Salon, Tattoo, Retail…"
          />
        </div>
        <div className="mt-4">
          <label className="label">Description</label>
          <textarea
            rows={5}
            className="field"
            value={form.description}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="Tell visitors who you are and what you offer."
          />
        </div>
        <div className="mt-4">
          <label className="label">Website or social link</label>
          <input
            className="field"
            value={form.contact_link}
            onChange={(e) => set({ contact_link: e.target.value })}
            placeholder="https://instagram.com/yourshop"
          />
        </div>
      </div>

      <div className="card p-5">
        <h3 className="font-display text-lg font-semibold text-ink">Photo</h3>
        <div className="mt-4">
          <label className="label">Logo or storefront photo</label>
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo}
              alt="Photo preview"
              className="mb-2 h-40 w-full rounded-lg object-cover"
            />
          ) : null}
          <input type="file" accept="image/*" onChange={onPhoto} className="block text-sm" />
          {uploading ? (
            <p className="mt-1 text-xs text-ink-muted">Uploading…</p>
          ) : null}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={busy || uploading || !form.business_name}
          className="btn-accent disabled:opacity-50"
        >
          Save listing →
        </button>
      </div>
    </div>
  );
}

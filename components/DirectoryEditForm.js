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
 * Tenant self-edit form. `entry` arrives with `links` ([{label, url}]) and
 * `photos` ([path, …]) already parsed by the server page. Tenants can add as
 * many links (each with its own button label) and photos as they like; the
 * first photo is the lead image on their directory card.
 */
export default function DirectoryEditForm({ entry, saveAction }) {
  const [form, setForm] = useState({
    business_name: entry.business_name || "",
    category: entry.category || "",
    description: entry.description || "",
  });
  const [links, setLinks] = useState(
    entry.links?.length ? entry.links : [{ label: "", url: "" }]
  );
  const [photos, setPhotos] = useState(entry.photos || []);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const setLink = (i, patch) =>
    setLinks((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const addLink = () => setLinks((ls) => [...ls, { label: "", url: "" }]);
  const removeLink = (i) => setLinks((ls) => ls.filter((_, j) => j !== i));

  async function onPhotos(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setError("");
    setUploading(true);
    try {
      for (const file of files) {
        const path = await uploadFile(file, "image");
        setPhotos((ps) => [...ps, path]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  const removePhoto = (i) => setPhotos((ps) => ps.filter((_, j) => j !== i));
  const makeLead = (i) =>
    setPhotos((ps) => [ps[i], ...ps.filter((_, j) => j !== i)]);

  async function handleSave() {
    setError("");
    setBusy(true);
    const res = await saveAction({
      ...form,
      links: links.filter((l) => (l.url || "").trim()),
      photos,
    });
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
      </div>

      <div className="card p-5">
        <h3 className="font-display text-lg font-semibold text-ink">Links</h3>
        <p className="mt-1 text-sm text-ink-muted">
          Add your website, socials, booking page — as many as you like. The
          button label is what visitors see, e.g. &ldquo;Book an appointment&rdquo;
          or &ldquo;Instagram&rdquo;.
        </p>
        <div className="mt-4 space-y-3">
          {links.map((l, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2 sm:flex-nowrap">
              <div className="w-full sm:w-2/5">
                <label className="label">Button label</label>
                <input
                  className="field"
                  value={l.label}
                  onChange={(e) => setLink(i, { label: e.target.value })}
                  placeholder="Instagram"
                />
              </div>
              <div className="min-w-0 flex-1">
                <label className="label">Link</label>
                <input
                  className="field"
                  value={l.url}
                  onChange={(e) => setLink(i, { url: e.target.value })}
                  placeholder="https://instagram.com/yourshop"
                />
              </div>
              <button
                type="button"
                onClick={() => removeLink(i)}
                className="mb-1 shrink-0 rounded-lg border border-ink/15 px-3 py-2 text-sm text-ink-muted hover:border-rust hover:text-rust"
                aria-label="Remove this link"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={addLink} className="btn-ghost mt-4">
          + Add another link
        </button>
      </div>

      <div className="card p-5">
        <h3 className="font-display text-lg font-semibold text-ink">Photos</h3>
        <p className="mt-1 text-sm text-ink-muted">
          Add photos of your space and work. The first photo is your cover — it
          shows on your directory card; the rest appear on your page.
        </p>
        {photos.length ? (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((p, i) => (
              <div key={p + i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p}
                  alt={`Photo ${i + 1}`}
                  className="h-28 w-full rounded-lg object-cover"
                />
                {i === 0 ? (
                  <span className="absolute left-1.5 top-1.5 rounded bg-ink/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-paper">
                    Cover
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => makeLead(i)}
                    className="absolute left-1.5 top-1.5 rounded bg-paper/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink hover:bg-paper"
                  >
                    Make cover
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
                  className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-ink/80 text-xs text-paper hover:bg-rust"
                  aria-label={`Remove photo ${i + 1}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <div className="mt-4">
          <label className="label">Add photos</label>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={onPhotos}
            className="block text-sm"
          />
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

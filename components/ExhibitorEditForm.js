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
 * Exhibitor self-edit form (token page). Saves bio fields + profile photo via
 * `saveAction`, and manages individual work photos via `addPhotoAction` /
 * `removePhotoAction` (each returns the refreshed works list).
 */
export default function ExhibitorEditForm({ exhibitor, saveAction, addPhotoAction, removePhotoAction }) {
  const [form, setForm] = useState({
    name: exhibitor.name || "",
    discipline: exhibitor.discipline || "",
    blurb: exhibitor.blurb || "",
    site_handle: exhibitor.site_handle || "",
  });
  const [profile, setProfile] = useState(exhibitor.profile_photo || "");
  const [works, setWorks] = useState(exhibitor.works || []);
  const [uploadingProfile, setUploadingProfile] = useState(false);
  const [uploadingWork, setUploadingWork] = useState(false);
  const [workCaption, setWorkCaption] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  async function onProfile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setUploadingProfile(true);
    try {
      setProfile(await uploadFile(file));
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingProfile(false);
    }
  }

  async function onAddWork(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setUploadingWork(true);
    try {
      const path = await uploadFile(file);
      const res = await addPhotoAction({ image_path: path, caption: workCaption.trim() || null });
      if (res?.ok) {
        setWorks(res.works || []);
        setWorkCaption("");
      } else {
        setError(res?.error || "Could not add photo.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingWork(false);
      e.target.value = "";
    }
  }

  async function onRemoveWork(id) {
    setError("");
    const res = await removePhotoAction(id);
    if (res?.ok) setWorks(res.works || []);
    else setError(res?.error || "Could not remove photo.");
  }

  async function handleSave() {
    setError("");
    setBusy(true);
    const res = await saveAction({ ...form, profile_photo: profile || null });
    setBusy(false);
    if (res?.ok) setDone(true);
    else setError(res?.error || "Something went wrong.");
  }

  return (
    <div className="space-y-5">
      {done ? (
        <div className="rounded-lg border border-brass/30 bg-brass/10 px-4 py-2 text-sm text-brass-dark">
          Saved — your exhibitor page is live. Keep editing from this same link anytime.
        </div>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-rust/30 bg-rust/10 px-4 py-2 text-sm text-rust">{error}</div>
      ) : null}

      <div className="card p-5">
        <label className="label">Name</label>
        <input className="field" value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Your name or studio" />
        <div className="mt-4">
          <label className="label">Discipline</label>
          <input className="field" value={form.discipline} onChange={(e) => set({ discipline: e.target.value })} placeholder="Painter · Oil & cold wax" />
        </div>
        <div className="mt-4">
          <label className="label">About your work</label>
          <textarea rows={5} className="field" value={form.blurb} onChange={(e) => set({ blurb: e.target.value })} placeholder="Tell visitors about your work and what you're showing." />
        </div>
        <div className="mt-4">
          <label className="label">Handle or website</label>
          <input className="field" value={form.site_handle} onChange={(e) => set({ site_handle: e.target.value })} placeholder="@yourhandle or https://…" />
        </div>
      </div>

      <div className="card p-5">
        <h3 className="font-display text-lg font-semibold text-ink">Profile photo</h3>
        <p className="mt-1 text-xs text-ink-muted">A portrait or headshot shown beside your bio.</p>
        {profile ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile} alt="Profile preview" className="mt-3 h-44 w-full rounded-lg object-cover" />
        ) : null}
        <input type="file" accept="image/*" onChange={onProfile} className="mt-3 block text-sm" />
        {uploadingProfile ? <p className="mt-1 text-xs text-ink-muted">Uploading…</p> : null}
      </div>

      <div className="card p-5">
        <h3 className="font-display text-lg font-semibold text-ink">Photos of your work</h3>
        <p className="mt-1 text-xs text-ink-muted">Add a few images of your work — these show on your exhibitor feature.</p>
        {works.length ? (
          <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
            {works.map((w) => (
              <div key={w.id} className="overflow-hidden rounded-lg border border-ink/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={w.image_path} alt={w.caption || "Work"} className="h-24 w-full object-cover" />
                <button type="button" onClick={() => onRemoveWork(w.id)} className="block w-full py-1 text-center text-[11px] font-semibold text-rust hover:underline">
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-ink-muted">No work photos yet.</p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            className="field max-w-xs text-sm"
            value={workCaption}
            onChange={(e) => setWorkCaption(e.target.value)}
            placeholder="Caption (optional)"
          />
          <label className="btn-ghost cursor-pointer text-sm">
            {uploadingWork ? "Uploading…" : "+ Add work photo"}
            <input type="file" accept="image/*" onChange={onAddWork} className="hidden" disabled={uploadingWork} />
          </label>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={handleSave} disabled={busy || uploadingProfile || !form.name} className="btn-accent disabled:opacity-50">
          Save my page →
        </button>
      </div>
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import { spaceName, formatDate, formatTime } from "@/lib/constants.js";

async function uploadFile(file, kind) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("kind", kind);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return data.path;
}

export default function HostListingForm({ event, saveAction, alreadyLive }) {
  const [form, setForm] = useState({
    title: event.title || "",
    description: event.description || "",
    date: event.date || "",
    time: event.time || "",
    tickets: event.tickets || "",
    price: event.price || "",
    payment_instructions: event.payment_instructions || "",
    payment_link: event.payment_link || "",
  });
  const [photo, setPhoto] = useState(event.photo_path || "");
  const [pdfs, setPdfs] = useState(() => {
    try { return event.pdf_paths ? JSON.parse(event.pdf_paths) : []; } catch { return []; }
  });
  const [uploading, setUploading] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  // Auto-dismiss the "saved" notice so it reads as a transient toast.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  async function onPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(""); setUploading("photo");
    try { setPhoto(await uploadFile(file, "image")); }
    catch (err) { setError(err.message); }
    finally { setUploading(""); }
  }

  async function onPdf(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(""); setUploading("pdf");
    try {
      const path = await uploadFile(file, "pdf");
      setPdfs((p) => [...p, path]);
    }
    catch (err) { setError(err.message); }
    finally { setUploading(""); e.target.value = ""; }
  }

  async function handleSubmit(submit) {
    setError(""); setNotice(""); setBusy(true);
    const res = await saveAction({
      ...form,
      tickets: form.tickets === "" ? null : Number(form.tickets),
      photo_path: photo || null,
      pdf_paths: pdfs,
      submit,
    });
    setBusy(false);
    if (res?.ok) {
      // Stay on the form; show a transient confirmation instead of navigating away.
      setNotice(
        !submit
          ? "Draft saved — keep editing whenever you like."
          : alreadyLive
            ? "Changes saved — your listing is updated."
            : "Submitted! The Alley will take a quick look, then it goes live. You can keep editing from this same link."
      );
    } else {
      setError(res?.error || "Something went wrong.");
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-paper-warm p-4 text-sm text-ink-soft">
        Booking: <strong>{spaceName(event.space)}</strong>
        {event.date ? ` · ${formatDate(event.date)}` : ""} — the date &amp; time are
        locked to your reservation; fill in the listing details below.
      </div>

      {notice ? (
        <div className="rounded-lg border border-verde-deep/30 bg-verde/40 px-4 py-2.5 text-sm font-medium text-ink">
          ✓ {notice}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-rust/30 bg-rust/10 px-4 py-2 text-sm text-rust">{error}</div>
      ) : null}

      <div className="card p-5">
        <label className="label">Event title</label>
        <input className="field" value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="Sunrise Vinyasa Yoga" />
        <div className="mt-4">
          <label className="label">Description</label>
          <textarea rows={5} className="field" value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="What should attendees expect? What to bring?" />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Date</label>
            <div className="field bg-paper-warm text-ink-soft" aria-readonly="true">
              {form.date ? formatDate(form.date) : "—"}
            </div>
          </div>
          <div>
            <label className="label">Time</label>
            <div className="field bg-paper-warm text-ink-soft" aria-readonly="true">
              {form.time ? formatTime(form.time) : "—"}
            </div>
          </div>
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          Date &amp; time come from your booking and can&apos;t be changed here. Need a different
          time? Contact The Alley.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Spots available</label>
            <input type="number" min="0" className="field" value={form.tickets} onChange={(e) => set({ tickets: e.target.value })} placeholder="12" />
          </div>
          <div>
            <label className="label">Price per spot (display only)</label>
            <input className="field" value={form.price} onChange={(e) => set({ price: e.target.value })} placeholder="$15" />
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h3 className="font-display text-lg font-semibold text-ink">How attendees pay you</h3>
        <p className="mt-1 text-sm text-ink-muted">
          The Alley takes no payment — you collect directly. Tell people how
          (Venmo, Cash App, pay at door…) and add a link if you have one.
        </p>
        <div className="mt-4">
          <label className="label">Payment instructions</label>
          <input className="field" value={form.payment_instructions} onChange={(e) => set({ payment_instructions: e.target.value })} placeholder="Venmo @priya-yoga, or cash at the door" />
        </div>
        <div className="mt-4">
          <label className="label">Payment link (optional)</label>
          <input className="field" value={form.payment_link} onChange={(e) => set({ payment_link: e.target.value })} placeholder="https://venmo.com/priya-yoga" />
        </div>
      </div>

      <div className="card p-5">
        <h3 className="font-display text-lg font-semibold text-ink">Photo & files</h3>
        <div className="mt-4">
          <label className="label">Flyer / photo</label>
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="Flyer preview" className="mb-2 h-40 w-full rounded-lg object-cover" />
          ) : null}
          <input type="file" accept="image/*" onChange={onPhoto} className="block text-sm" />
          {uploading === "photo" ? <p className="mt-1 text-xs text-ink-muted">Uploading…</p> : null}
        </div>
        <div className="mt-4">
          <label className="label">PDFs (supply lists, details…)</label>
          {pdfs.length ? (
            <ul className="mb-2 space-y-1 text-sm">
              {pdfs.map((p, i) => (
                <li key={i} className="flex items-center justify-between rounded bg-paper-warm px-3 py-1.5">
                  <span className="truncate text-ink-soft">{p.split("/").pop()}</span>
                  <button type="button" onClick={() => setPdfs((arr) => arr.filter((_, j) => j !== i))} className="text-xs font-semibold text-rust">remove</button>
                </li>
              ))}
            </ul>
          ) : null}
          <input type="file" accept="application/pdf" onChange={onPdf} className="block text-sm" />
          {uploading === "pdf" ? <p className="mt-1 text-xs text-ink-muted">Uploading…</p> : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={() => handleSubmit(false)} disabled={busy || uploading} className="btn-ghost">
          Save draft
        </button>
        <button onClick={() => handleSubmit(true)} disabled={busy || uploading || !form.title} className="btn-accent disabled:opacity-50">
          {alreadyLive ? "Save & update listing" : "Submit for review →"}
        </button>
      </div>
    </div>
  );
}

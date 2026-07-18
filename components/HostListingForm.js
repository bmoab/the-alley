"use client";
import { useEffect, useState } from "react";
import { spaceName, formatDate, formatTime } from "@/lib/constants.js";
import LinksEditor from "@/components/LinksEditor.js";
import SessionContentEditor from "@/components/SessionContentEditor.js";

function parseLinks(raw) {
  try {
    const l = JSON.parse(raw || "[]");
    return Array.isArray(l) ? l.filter((x) => x && x.url) : [];
  } catch {
    return [];
  }
}

async function uploadFile(file, kind) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("kind", kind);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return data.path;
}

export default function HostListingForm({ event, saveAction, alreadyLive, lastEvent, sessions = [] }) {
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
  const [links, setLinks] = useState(() => parseLinks(event.links));
  const isSeries = sessions.length > 1;
  const [sessionContent, setSessionContent] = useState(() => {
    try {
      const sc = JSON.parse(event.session_content || "{}");
      return { fields: Array.isArray(sc.fields) ? sc.fields : [], sessions: sc.sessions || {} };
    } catch {
      return { fields: [], sessions: {} };
    }
  });
  const [pdfs, setPdfs] = useState(() => {
    try { return event.pdf_paths ? JSON.parse(event.pdf_paths) : []; } catch { return []; }
  });
  const [uploading, setUploading] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null); // { msg, at: Date } | null
  const [busy, setBusy] = useState(false);

  const [prefilled, setPrefilled] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  // Copy everything from the host's previous event so they can tweak instead of
  // starting blank. Date/time stay locked to this booking.
  function prefillFromLast() {
    if (!lastEvent) return;
    setForm((f) => ({
      ...f,
      title: lastEvent.title || f.title,
      description: lastEvent.description || "",
      tickets: lastEvent.tickets ?? "",
      price: lastEvent.price || "",
      payment_instructions: lastEvent.payment_instructions || "",
      payment_link: lastEvent.payment_link || "",
    }));
    if (lastEvent.photo_path) setPhoto(lastEvent.photo_path);
    setLinks(parseLinks(lastEvent.links));
    try {
      const p = JSON.parse(lastEvent.pdf_paths || "[]");
      if (Array.isArray(p)) setPdfs(p);
    } catch {}
    setPrefilled(true);
  }

  // Auto-dismiss the saved toast after a bit (it also has an × to close).
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 10000);
    return () => clearTimeout(t);
  }, [toast]);

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
    setError(""); setToast(null); setBusy(true);
    const res = await saveAction({
      ...form,
      tickets: form.tickets === "" ? null : Number(form.tickets),
      photo_path: photo || null,
      pdf_paths: pdfs,
      links,
      session_content: isSeries ? sessionContent : { fields: [], sessions: {} },
      submit,
    });
    setBusy(false);
    if (res?.ok) {
      // Stay on the form; show a transient toast pill instead of navigating away.
      setToast({
        msg: !submit
          ? "Draft saved — keep editing whenever you like."
          : alreadyLive
            ? "Changes saved — your listing is updated."
            : "Submitted! The Alley will take a quick look, then it goes live. You can keep editing from this link.",
        at: new Date(),
      });
    } else {
      setError(res?.error || "Something went wrong.");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-paper-warm p-4 text-sm text-ink-soft">
        <span>
          Booking: <strong>{spaceName(event.space)}</strong>
          {isSeries
            ? ` · recurring series · ${sessions.length} sessions`
            : event.date ? ` · ${formatDate(event.date)}` : ""}
          {" "}— the date{isSeries ? "s" : ""} &amp; time are locked to your reservation;
          fill in the listing details below.
        </span>
        {alreadyLive ? (
          <a
            href={`/events/${event.id}`}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 whitespace-nowrap font-semibold text-brass-dark hover:underline"
          >
            View your live listing →
          </a>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-lg border border-rust/30 bg-rust/10 px-4 py-2 text-sm text-rust">{error}</div>
      ) : null}

      {lastEvent && !prefilled ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-verde-deep/30 bg-verde/30 p-4 text-sm text-ink">
          <span>
            Welcome back! Want to start from your last event
            {lastEvent.title ? ` (“${lastEvent.title}”)` : ""}? We&apos;ll copy its
            details, photo, and links here — you can tweak anything before posting.
          </span>
          <button
            type="button"
            onClick={prefillFromLast}
            className="btn-accent shrink-0 whitespace-nowrap"
          >
            Use my last event
          </button>
        </div>
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
        <h3 className="font-display text-lg font-semibold text-ink">Links</h3>
        <p className="mt-1 text-sm text-ink-muted">
          Add your website, tickets page, or socials — they show as buttons on your
          listing (much cleaner than pasting a URL in the description). A label is
          optional; we&apos;ll name it for you if you leave it blank.
        </p>
        <div className="mt-4">
          {/* key flips once on prefill so the editor re-seeds from the copied
              links; it stays stable during normal editing (no focus loss). */}
          <LinksEditor key={prefilled ? "prefilled" : "initial"} value={links} onChange={setLinks} />
        </div>
      </div>

      {isSeries ? (
        <SessionContentEditor
          key={prefilled ? "sc-prefilled" : "sc-initial"}
          sessions={sessions}
          value={sessionContent}
          onChange={setSessionContent}
        />
      ) : null}

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

      {/* Floating saved-toast pill (message + time + × to close). */}
      {toast ? (
        <div
          className="fixed inset-x-0 bottom-5 z-50 flex justify-center px-4"
          role="status"
          aria-live="polite"
        >
          <div className="flex max-w-lg items-start gap-3 rounded-full border border-ink/10 bg-ink px-5 py-3 text-sm text-paper shadow-lg">
            <span className="mt-0.5 text-brass">✓</span>
            <span className="flex-1">
              {toast.msg}{" "}
              <span className="opacity-60">
                · {toast.at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </span>
            </span>
            <button
              type="button"
              onClick={() => setToast(null)}
              aria-label="Dismiss"
              className="-mr-1 -mt-0.5 rounded-full p-1 text-paper/70 transition hover:bg-paper/10 hover:text-paper"
            >
              ✕
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

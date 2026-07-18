"use client";
import { useState } from "react";
import { formatDate } from "@/lib/constants.js";

async function uploadFile(file) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("kind", "image");
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return data.path;
}

// Fields a host may vary per session (must match PER_SESSION_FIELDS in catalog).
const FIELDS = [
  { key: "title", label: "Title" },
  { key: "description", label: "Description", textarea: true },
  { key: "photo_path", label: "Photo", photo: true },
  { key: "tickets", label: "Spots", number: true },
  { key: "price", label: "Price" },
];

/**
 * Per-session content editor for a recurring series listing. The host ticks
 * which fields should differ per session; for each ticked field a value is
 * collected for every session date. Anything left blank falls back to the
 * shared value from the main form. Controlled via onChange(value) where value =
 * { fields:[], sessions:{ [date]: { [field]: val } } }.
 */
export default function SessionContentEditor({ sessions, value, onChange }) {
  const [fields, setFields] = useState(() => value?.fields || []);
  const [vals, setVals] = useState(() => value?.sessions || {});
  const [uploading, setUploading] = useState("");

  const emit = (f, v) => onChange?.({ fields: f, sessions: v });
  const toggle = (k) => {
    const nf = fields.includes(k) ? fields.filter((x) => x !== k) : [...fields, k];
    setFields(nf);
    emit(nf, vals);
  };
  const setVal = (date, k, v) => {
    const nv = { ...vals, [date]: { ...(vals[date] || {}), [k]: v } };
    setVals(nv);
    emit(fields, nv);
  };

  async function onPhoto(date, e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(date);
    try { setVal(date, "photo_path", await uploadFile(file)); }
    catch { /* ignore; host can retry */ }
    finally { setUploading(""); }
  }

  const active = FIELDS.filter((f) => fields.includes(f.key));

  return (
    <div className="card p-5">
      <h3 className="font-display text-lg font-semibold text-ink">Different details each session?</h3>
      <p className="mt-1 text-sm text-ink-muted">
        Your booking has {sessions.length} sessions. By default they all share the
        details above. Tick anything that changes week to week (e.g. a different
        topic each time) and fill it in per date — blanks use the shared value.
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        {FIELDS.map((f) => (
          <label key={f.key} className="flex items-center gap-2 text-sm font-medium text-ink">
            <input
              type="checkbox"
              checked={fields.includes(f.key)}
              onChange={() => toggle(f.key)}
              className="h-4 w-4 accent-verde-deep"
            />
            {f.label}
          </label>
        ))}
      </div>

      {active.length ? (
        <div className="mt-4 space-y-3">
          {sessions.map((s, i) => (
            <div key={s.date} className="rounded-lg border border-line bg-paper-warm p-3">
              <div className="text-sm font-semibold text-ink">
                Session {s.index || i + 1} · {formatDate(s.date)}
              </div>
              <div className="mt-2 grid gap-2">
                {active.map((f) => {
                  const v = vals[s.date]?.[f.key] ?? "";
                  return (
                    <div key={f.key}>
                      <label className="label">{f.label}</label>
                      {f.textarea ? (
                        <textarea rows={2} className="field" value={v} onChange={(e) => setVal(s.date, f.key, e.target.value)} placeholder="Leave blank to use the shared value" />
                      ) : f.photo ? (
                        <div>
                          {v ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={v} alt="" className="mb-1 h-20 w-full rounded object-cover" />
                          ) : null}
                          <input type="file" accept="image/*" onChange={(e) => onPhoto(s.date, e)} className="block text-xs" />
                          {uploading === s.date ? <span className="text-xs text-ink-muted">Uploading…</span> : null}
                        </div>
                      ) : (
                        <input type={f.number ? "number" : "text"} min={f.number ? "0" : undefined} className="field" value={v} onChange={(e) => setVal(s.date, f.key, e.target.value)} placeholder="Leave blank to use the shared value" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

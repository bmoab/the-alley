"use client";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Pencil } from "lucide-react";
import Button from "./Button.js";
import { cx } from "./cx.js";

function Save() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : "Save"}
    </Button>
  );
}

/**
 * A section that reads like a summary and only turns into a form when you
 * press Edit. `icon` is an icon element; `view` is the summary; `children` are the fields. `action` is a
 * server action that returns { error } to keep the form open with a message,
 * or anything else to close it with a quick "Saved ✓". `hidden` = extra
 * values to post (an id).
 */
export default function EditCard({ title, icon, view, children, action, hidden = {}, className }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function submit(formData) {
    setError("");
    const res = await action(formData);
    if (res?.error) {
      setError(res.error);
      return;
    }
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  }

  return (
    <section className={cx("card p-5", className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">
          {icon}
          {title}
        </h2>
        {saved ? (
          <span className="text-xs font-semibold text-verde-deep">Saved ✓</span>
        ) : !editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-ink-soft transition hover:bg-paper-dim hover:text-ink"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            Edit
          </button>
        ) : null}
      </div>
      {editing ? (
        <form action={submit} className="mt-4 space-y-4">
          {Object.entries(hidden).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          {children}
          {error ? <p className="text-xs font-semibold text-rust">{error}</p> : null}
          <div className="flex items-center gap-2 pt-1">
            <Save />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setError("");
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-3">{view}</div>
      )}
    </section>
  );
}

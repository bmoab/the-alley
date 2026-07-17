"use client";
import { useState } from "react";

/**
 * Add/remove labeled links [{label,url}] — mirrors the directory/exhibitor link
 * editor. Works two ways:
 *  - controlled: pass `onChange` and read the cleaned array in your own submit
 *    (used by the host self-edit form, which posts via a server action).
 *  - native form: pass `name` and it emits a hidden input with the JSON, so the
 *    links post with a plain <form> (used by the admin event editor).
 */
export default function LinksEditor({ value = [], onChange, name }) {
  const [links, setLinks] = useState(value.length ? value : [{ label: "", url: "" }]);

  const commit = (next) => {
    setLinks(next);
    onChange?.(next.filter((l) => (l.url || "").trim()));
  };
  const setLink = (i, patch) => commit(links.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const addLink = () => commit([...links, { label: "", url: "" }]);
  const removeLink = (i) => commit(links.filter((_, j) => j !== i));

  const clean = links.filter((l) => (l.url || "").trim());

  return (
    <div>
      {name ? <input type="hidden" name={name} value={JSON.stringify(clean)} /> : null}
      <div className="space-y-2">
        {links.map((l, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
            <input
              className="field sm:w-40"
              placeholder="Label (optional)"
              value={l.label}
              onChange={(e) => setLink(i, { label: e.target.value })}
            />
            <input
              className="field flex-1"
              placeholder="https://your-site.com  ·  @handle"
              value={l.url}
              onChange={(e) => setLink(i, { url: e.target.value })}
            />
            <button
              type="button"
              onClick={() => removeLink(i)}
              aria-label="Remove link"
              className="shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-rust hover:bg-rust/10"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addLink}
        className="mt-2 text-sm font-semibold text-verde-deep hover:underline"
      >
        + Add another link
      </button>
    </div>
  );
}

"use client";
import { useEffect, useMemo, useState } from "react";
import { Plus, X, ChevronUp, ChevronDown } from "lucide-react";

/**
 * Friendly repeater for the structured content lists — replaces the raw JSON
 * textareas so a stray comma/bracket can't break a field. Renders one row per
 * item with reorder + remove, plus an "Add" button, and emits valid JSON.
 *
 * Modes:
 *   - Uncontrolled (default): writes a hidden <input name={name}> = JSON of the
 *     cleaned array, so it posts with the surrounding form's server action.
 *   - Controlled: pass `onChange(cleanedArray)` (and omit `name`) to embed it
 *     inside a composite editor (e.g. Art Beat ways).
 *
 * `schema.kind`:
 *   "strings" → each item is a string (one input per row).
 *   "objects" → each item is an object; `schema.fields:[{key,label,placeholder,textarea?}]`.
 *   "tuples"  → each item is a positional array; `schema.fields:[{label,placeholder,textarea?}]`.
 */

function parseInitial(value, kind) {
  let arr = [];
  try {
    const v = typeof value === "string" ? JSON.parse(value || "[]") : value;
    if (Array.isArray(v)) arr = v;
  } catch {
    arr = [];
  }
  // Normalize to editable row shapes.
  if (kind === "strings") return arr.map((s) => (s == null ? "" : String(s)));
  if (kind === "tuples") return arr.map((row) => (Array.isArray(row) ? row.map((c) => (c == null ? "" : String(c))) : []));
  return arr.map((o) => (o && typeof o === "object" ? o : {}));
}

function emptyRow(schema) {
  if (schema.kind === "strings") return "";
  if (schema.kind === "tuples") return schema.fields.map(() => "");
  return Object.fromEntries(schema.fields.map((f) => [f.key, ""]));
}

function clean(items, schema) {
  if (schema.kind === "strings") {
    return items.map((s) => (s || "").trim()).filter(Boolean);
  }
  if (schema.kind === "tuples") {
    return items
      .map((row) => schema.fields.map((_, i) => (row[i] || "").trim()))
      .filter((row) => row.some(Boolean));
  }
  return items
    .map((o) => {
      const out = {};
      for (const f of schema.fields) out[f.key] = (o[f.key] || "").trim();
      return out;
    })
    .filter((o) => schema.fields.some((f) => o[f.key]));
}

export default function StructuredListField({ name, value = "[]", schema, onChange }) {
  const [items, setItems] = useState(() => parseInitial(value, schema.kind));

  const cleaned = useMemo(() => clean(items, schema), [items, schema]);

  useEffect(() => {
    if (onChange) onChange(cleaned);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleaned]);

  const update = (i, next) => setItems((arr) => arr.map((it, j) => (j === i ? next : it)));
  const setCell = (i, key, val) =>
    update(i, schema.kind === "strings" ? val : schema.kind === "tuples" ? items[i].map((c, k) => (k === key ? val : c)) : { ...items[i], [key]: val });
  const add = () => setItems((arr) => [...arr, emptyRow(schema)]);
  const remove = (i) => setItems((arr) => arr.filter((_, j) => j !== i));
  const move = (i, dir) =>
    setItems((arr) => {
      const j = i + dir;
      if (j < 0 || j >= arr.length) return arr;
      const copy = arr.slice();
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  const Field = ({ textarea, ...p }) =>
    textarea ? <textarea rows={2} className="field" {...p} /> : <input className="field" {...p} />;

  return (
    <div>
      {!onChange ? <input type="hidden" name={name} value={JSON.stringify(cleaned)} /> : null}

      <div className="space-y-3">
        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-xs text-ink-muted">
            Nothing here yet — use “{schema.addLabel || "Add"}” below.
          </p>
        ) : null}

        {items.map((item, i) => (
          <div key={i} className="rounded-lg border border-line bg-paper-warm/40 p-3">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                {schema.kind === "strings" ? (
                  <Field
                    value={item}
                    placeholder={schema.placeholder || schema.itemLabel}
                    onChange={(e) => setCell(i, null, e.target.value)}
                  />
                ) : (
                  schema.fields.map((f, k) => {
                    const key = schema.kind === "tuples" ? k : f.key;
                    const val = schema.kind === "tuples" ? item[k] || "" : item[f.key] || "";
                    return (
                      <div key={key}>
                        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                          {f.label}
                        </label>
                        <Field
                          textarea={f.textarea}
                          value={val}
                          placeholder={f.placeholder}
                          onChange={(e) => setCell(i, key, e.target.value)}
                        />
                      </div>
                    );
                  })
                )}
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="rounded p-1 text-ink-muted hover:bg-paper hover:text-ink disabled:opacity-30">
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Move down" className="rounded p-1 text-ink-muted hover:bg-paper hover:text-ink disabled:opacity-30">
                  <ChevronDown className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => remove(i)} aria-label="Remove" className="rounded p-1 text-ink-muted hover:bg-rust/10 hover:text-rust">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={add}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-3 py-1.5 text-sm font-semibold text-ink transition hover:border-ink/50 hover:bg-paper-dim"
      >
        <Plus className="h-4 w-4" /> {schema.addLabel || "Add"}
      </button>
    </div>
  );
}

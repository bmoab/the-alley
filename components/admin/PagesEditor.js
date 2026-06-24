"use client";
import { useRef } from "react";
import Card from "./ui/Card.js";
import Button from "./ui/Button.js";
import ContentImageField from "../ContentImageField.js";
import StructuredListField from "./StructuredListField.js";
import ArtBeatField from "./ArtBeatField.js";

/**
 * The split editor pane: page fields on the left, a preview iframe of the real
 * public page on the right. Focusing a field posts the field's content key to
 * the iframe so the matching element (tagged `data-edit`) scrolls into view and
 * flashes. The preview only refreshes on Save (cache-busted via `saved`).
 *
 * Field config is plain/serializable so it can come from the server component;
 * `save` is a server action passed through to <form action>.
 */
export default function PagesEditor({ slug, route, label, fields, values, saved, note, save }) {
  const iframeRef = useRef(null);

  const highlight = (key) => {
    const w = iframeRef.current?.contentWindow;
    if (w) w.postMessage({ type: "alley-edit-highlight", key }, window.location.origin);
  };

  const sep = route.includes("?") ? "&" : "?";
  const previewSrc = `${route}${sep}preview=1&_=${saved || "0"}`;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Left — fields */}
      <form action={save} className="space-y-4">
        <input type="hidden" name="__slug" value={slug} />

        {fields.text.map((f) => (
          <Card key={f.key} pad="md" onFocusCapture={() => highlight(f.key)}>
            <label className="label" htmlFor={f.key}>{f.label}</label>
            {f.textarea ? (
              <textarea id={f.key} name={f.key} rows={f.rows || 3} defaultValue={values[f.key] || ""} className="field" />
            ) : (
              <input id={f.key} name={f.key} defaultValue={values[f.key] || ""} className="field" />
            )}
          </Card>
        ))}

        {fields.image.map((f) => (
          <div key={f.key} onFocusCapture={() => highlight(f.key)}>
            <ContentImageField name={f.key} label={f.label} hint={f.hint} value={values[f.key] || ""} />
          </div>
        ))}

        {fields.list.map((f) => (
          <Card key={f.key} pad="md" onFocusCapture={() => highlight(f.key)}>
            <label className="label">{f.label}</label>
            {f.type === "artbeat" ? (
              <ArtBeatField name={f.key} value={values[f.key] || "{}"} />
            ) : (
              <StructuredListField name={f.key} value={values[f.key] || "[]"} schema={f.schema} />
            )}
          </Card>
        ))}

        {note ? <p className="px-1 text-xs text-ink-muted">{note}</p> : null}

        <Button type="submit">Save changes</Button>
      </form>

      {/* Right — preview */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Preview — updates when you Save
          </span>
          <span className="text-[11px] text-ink-muted">Click a field to find it here ↓</span>
        </div>
        <div className="h-[60vh] overflow-hidden rounded-xl border border-line bg-paper lg:h-[calc(100vh-9rem)]">
          <iframe
            ref={iframeRef}
            key={previewSrc}
            src={previewSrc}
            title={`Preview of ${label}`}
            className="h-full w-full"
          />
        </div>
      </div>
    </div>
  );
}

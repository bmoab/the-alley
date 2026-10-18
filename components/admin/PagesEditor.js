"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Monitor, Tablet, Smartphone } from "lucide-react";
import Card from "./ui/Card.js";
import Button from "./ui/Button.js";
import ContentImageField from "../ContentImageField.js";
import ImageCropField from "../ImageCropField.js";
import StructuredListField from "./StructuredListField.js";
import ArtBeatField from "./ArtBeatField.js";
import { cx } from "./ui/cx.js";

/**
 * The split editor: page fields on the left, the real public page on the right.
 *
 * The preview shows your UNSAVED edits: every change is stored as a draft
 * (/api/admin/page-draft) and the preview reloads with ?draft=<id>, which only a
 * signed-in admin's preview can see — the live site never does. A banner says
 * so until Save. The preview can be shown at desktop, tablet or phone width; a
 * desktop page is drawn at full size and scaled down to fit.
 *
 * Focusing a field posts its content key to the preview so the matching element
 * (tagged `data-edit`) scrolls into view and flashes.
 */

const DEVICES = [
  { key: "desktop", label: "Desktop", icon: Monitor, width: 1440 },
  { key: "tablet", label: "iPad", icon: Tablet, width: 820 },
  { key: "phone", label: "Phone", icon: Smartphone, width: 390 },
];

// Everything the form would post, as one comparable string + an object.
function snapshot(form) {
  if (!form) return { key: "", values: {} };
  const values = {};
  for (const [k, v] of new FormData(form).entries()) {
    if (k.startsWith("__") || typeof v !== "string") continue;
    values[k] = v;
  }
  return { key: JSON.stringify(values), values };
}

export default function PagesEditor({ slug, route, label, fields, values, saved, note, save }) {
  const formRef = useRef(null);
  const iframeRef = useRef(null);
  const frameBoxRef = useRef(null);
  const baseline = useRef("");
  const touched = useRef(false);
  const lastSent = useRef("");
  const lastTick = useRef("");
  const draftId = useRef(null);
  const scrollY = useRef(0);
  const [dirty, setDirty] = useState(false);
  const [draftKey, setDraftKey] = useState(null); // `${id}:${n}` once there's a draft to show
  const [device, setDevice] = useState("desktop");
  const [boxWidth, setBoxWidth] = useState(0);
  const [saving, setSaving] = useState(false);

  // After a Save the page reloads with a new `saved`: start clean again.
  useEffect(() => {
    touched.current = false;
    baseline.current = "";
    lastSent.current = "";
    setDirty(false);
    setDraftKey(null);
    setSaving(false);
  }, [saved]);

  // Watch the form. Fields like the photo croppers settle on default values
  // after they load, so the "saved" state is whatever the form says until the
  // person actually touches something.
  useEffect(() => {
    let timer = null;
    const tick = async () => {
      const snap = snapshot(formRef.current);
      if (!touched.current) {
        baseline.current = snap.key;
        return;
      }
      const isDirty = snap.key !== baseline.current;
      setDirty(isDirty);
      // Only refresh the preview once typing pauses (same for a whole tick).
      const settled = snap.key === lastTick.current;
      lastTick.current = snap.key;
      if (!settled || snap.key === lastSent.current) return;
      lastSent.current = snap.key;
      try {
        const res = await fetch("/api/admin/page-draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: draftId.current, values: snap.values }),
        });
        const data = await res.json();
        if (data.id) {
          draftId.current = data.id;
          rememberScroll();
          setDraftKey(`${data.id}:${Date.now()}`);
        }
      } catch {
        lastSent.current = ""; // try again next tick
      }
    };
    timer = setInterval(tick, 700);
    return () => clearInterval(timer);
  }, []);

  // Leaving with unsaved edits asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // How wide the preview box is, to scale a wider page down into it.
  useEffect(() => {
    const el = frameBoxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setBoxWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const markTouched = () => {
    touched.current = true;
  };

  const highlight = (key) => {
    const w = iframeRef.current?.contentWindow;
    if (w) w.postMessage({ type: "alley-edit-highlight", key }, window.location.origin);
  };

  // Keep the preview where it was scrolled when it reloads with new edits.
  const rememberScroll = useCallback(() => {
    try {
      scrollY.current = iframeRef.current?.contentWindow?.scrollY || 0;
    } catch {
      /* not loaded yet */
    }
  }, []);
  const restoreScroll = () => {
    try {
      iframeRef.current?.contentWindow?.scrollTo(0, scrollY.current);
    } catch {
      /* ignore */
    }
  };

  const sep = route.includes("?") ? "&" : "?";
  const [draft, n] = draftKey ? draftKey.split(":") : [null, null];
  const previewSrc = draft ? `${route}${sep}preview=1&draft=${draft}&_=${n}` : `${route}${sep}preview=1&_=${saved || "0"}`;

  const dev = DEVICES.find((d) => d.key === device);
  const scale = boxWidth ? Math.min(1, boxWidth / dev.width) : 1;

  const discard = () => {
    if (window.confirm("Throw away your unsaved changes on this page?")) {
      setDirty(false);
      window.location.reload();
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(340px,5fr)_7fr]">
      {/* Unsaved-changes banner, floating at the top while there are any. */}
      {dirty ? (
        <div className="pointer-events-none fixed inset-x-0 top-3 z-40 flex justify-center px-4 lg:left-64">
          <div className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 shadow-card">
            <span>
              <strong>Unsaved changes.</strong> The preview shows them, but they&apos;re not live until you Save.
            </span>
            <span className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  setSaving(true);
                  formRef.current?.requestSubmit();
                }}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save now"}
              </Button>
              <Button size="sm" variant="ghost" onClick={discard}>
                Discard
              </Button>
            </span>
          </div>
        </div>
      ) : null}

      {/* Left — fields */}
      <form
        ref={formRef}
        action={save}
        onSubmit={() => {
          setSaving(true);
          setDirty(false);
        }}
        onInputCapture={markTouched}
        onChangeCapture={markTouched}
        onPointerDownCapture={markTouched}
        onKeyDownCapture={markTouched}
        className="space-y-4"
      >
        <input type="hidden" name="__slug" value={slug} />

        {fields.image.map((f) => (
          <div key={f.key} onFocusCapture={() => highlight(f.key)} onPointerDownCapture={() => highlight(f.key)}>
            {f.kind === "crop" ? (
              <ImageCropField name={f.key} label={f.label} hint={f.hint} value={values[f.key] || ""} crop={values[`${f.key}_crop`] || ""} />
            ) : (
              <ContentImageField
                name={f.key}
                label={f.label}
                hint={f.hint}
                value={values[f.key] || ""}
                framing={f.kind === "framing"}
                pos={values[`${f.key}_pos`] || "50% 50%"}
                fit={values[`${f.key}_fit`] || "cover"}
              />
            )}
          </div>
        ))}

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

        <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
      </form>

      {/* Right — preview */}
      <div className="xl:sticky xl:top-6 xl:self-start">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
            {dirty ? "Preview — with your unsaved changes" : "Preview"}
          </span>
          <div className="flex rounded-xl border border-line bg-paper p-0.5">
            {DEVICES.map((d) => {
              const Icon = d.icon;
              return (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => setDevice(d.key)}
                  aria-pressed={device === d.key}
                  className={cx(
                    "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition",
                    device === d.key ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>
        <div
          ref={frameBoxRef}
          className="h-[70vh] overflow-hidden rounded-xl border border-line bg-paper-dim xl:h-[calc(100vh-9rem)]"
        >
          {boxWidth ? (
            <div
              className="mx-auto h-full"
              style={{ width: Math.min(boxWidth, dev.width * scale) }}
            >
              <iframe
                ref={iframeRef}
                key={previewSrc}
                src={previewSrc}
                onLoad={restoreScroll}
                title={`Preview of ${label}`}
                className="origin-top-left border-0 bg-paper"
                style={{
                  width: dev.width,
                  height: `${100 / scale}%`,
                  transform: `scale(${scale})`,
                }}
              />
            </div>
          ) : null}
        </div>
        <p className="mt-1.5 text-[11px] text-ink-muted">
          {dev.label} width ({dev.width}px){scale < 1 ? `, shrunk to fit` : ""}. Click a field to find it here.
        </p>
      </div>
    </div>
  );
}

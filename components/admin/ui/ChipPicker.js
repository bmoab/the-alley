"use client";
import { useState } from "react";
import { Check } from "lucide-react";
import { cx } from "./cx.js";

/**
 * Pick any number of options by tapping chips (instead of a list of
 * checkboxes). Posts each chosen value under `name`. `groups` =
 * [{ title, options: [{ value, label, note }] }]; a note is a quiet line on
 * the chip ("shared with …").
 */
export default function ChipPicker({ name, groups, defaultSelected = [] }) {
  const [picked, setPicked] = useState(() => new Set(defaultSelected.map(String)));
  const flip = (v) =>
    setPicked((s) => {
      const next = new Set(s);
      next.has(v) ? next.delete(v) : next.add(v);
      return next;
    });
  return (
    <div className="space-y-3">
      {[...picked].map((v) => (
        <input key={v} type="hidden" name={name} value={v} />
      ))}
      {groups.map((g) =>
        g.options.length ? (
          <div key={g.title}>
            {g.title ? <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{g.title}</p> : null}
            <div className="flex flex-wrap gap-2">
              {g.options.map((o) => {
                const v = String(o.value);
                const on = picked.has(v);
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => flip(v)}
                    aria-pressed={on}
                    className={cx(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition",
                      on ? "border-ink bg-ink text-paper" : "border-line-strong bg-paper text-ink-soft hover:border-ink/50 hover:text-ink"
                    )}
                  >
                    {on ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                    <span className="font-semibold">{o.label}</span>
                    {o.note ? <span className={cx("text-xs", on ? "text-paper/70" : "text-ink-muted")}>{o.note}</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null
      )}
    </div>
  );
}

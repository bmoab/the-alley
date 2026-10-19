"use client";
import { useState } from "react";
import { Check, Copy, ExternalLink, Link2 } from "lucide-react";
import { cx } from "./cx.js";

/**
 * A link you can hand over: shows it, and one tap anywhere on it copies it
 * ("Copied ✓"). Open ↗ beside it. Use for every private link and pay link, so
 * nobody has to select text out of a box.
 */
export default function CopyField({ url, open = true, className }) {
  const [done, setDone] = useState(false);
  if (!url) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setDone(true);
      setTimeout(() => setDone(false), 1800);
    } catch {
      window.prompt("Copy this link:", url);
    }
  };
  return (
    <div className={cx("flex items-stretch gap-2", className)}>
      <button
        type="button"
        onClick={copy}
        title="Copy link"
        className={cx(
          "group flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition",
          done ? "border-verde-deep/40 bg-verde/50" : "border-line bg-paper-warm hover:border-verde-deep/40 hover:bg-verde/30"
        )}
      >
        <Link2 className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink-soft">{url.replace(/^https?:\/\//, "")}</span>
        <span
          className={cx(
            "inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition",
            done ? "bg-verde-deep text-paper" : "bg-ink text-paper group-hover:bg-ink-soft"
          )}
        >
          {done ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
          {done ? "Copied" : "Copy"}
        </span>
      </button>
      {open ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          title="Open in a new tab"
          aria-label="Open in a new tab"
          className="inline-flex w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-paper text-ink-soft transition hover:border-ink/40 hover:text-ink"
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </a>
      ) : null}
    </div>
  );
}

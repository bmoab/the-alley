"use client";
import { useState } from "react";

/** A small "Copy link" button, for handing an invite link over by text instead of email. */
export default function CopyLink({ url, label = "Copy link" }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          window.prompt("Copy this link:", url);
        }
      }}
      className="ui-btn ui-btn--subtle inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-paper-dim px-3 text-xs font-semibold text-ink-soft transition-colors hover:bg-verde/40 hover:text-ink"
    >
      {done ? "Copied ✓" : label}
    </button>
  );
}

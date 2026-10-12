"use client";

export default function PrintButton({ children = "Print" }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="h-10 rounded-xl bg-ink px-5 text-sm font-semibold text-paper hover:bg-ink-soft"
    >
      {children}
    </button>
  );
}

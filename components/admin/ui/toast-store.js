"use client";
// Minimal module-level pub/sub for admin toasts. Client components can call
// `toast("Saved", { tone: "success" })` directly. Server actions can't reach
// this (different runtime) — they redirect with query params that <Toaster />
// translates into toasts instead.

let listeners = new Set();
let counter = 0;

export function toast(message, opts = {}) {
  const item = {
    id: ++counter,
    message,
    tone: opts.tone || "neutral",
    duration: opts.duration ?? 4000,
  };
  listeners.forEach((fn) => fn(item));
  return item.id;
}

export function subscribeToasts(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

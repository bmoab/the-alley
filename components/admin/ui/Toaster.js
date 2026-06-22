"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { subscribeToasts } from "./toast-store.js";
import { cx } from "./cx.js";

export { toast } from "./toast-store.js";

const TONE = {
  success: { cls: "border-verde-deep/40 bg-paper", icon: CheckCircle2, iconCls: "text-verde-deep" },
  error: { cls: "border-rust/40 bg-paper", icon: AlertTriangle, iconCls: "text-rust" },
  neutral: { cls: "border-line bg-paper", icon: Info, iconCls: "text-ink-muted" },
};

// Translate the query params that existing server actions already redirect with
// into a toast. Returns { message, tone } or null. Also strips a generic
// ?toast=&toastType= pair for any new code that wants to opt in.
function paramsToToast(sp) {
  if (sp.get("toast")) {
    return { message: sp.get("toast"), tone: sp.get("toastType") || "neutral" };
  }
  if (sp.has("paid")) {
    return { message: "Payment recorded — booking confirmed.", tone: "success" };
  }
  if (sp.has("checked")) {
    const r = sp.get("r");
    if (r === "nopay") return { message: "No payment found yet for that invoice.", tone: "neutral" };
    if (r === "error") return { message: "Couldn't reach Square to check payment.", tone: "error" };
    return { message: "Checked invoice status.", tone: "neutral" };
  }
  if (sp.has("test")) {
    const ok = sp.get("test") === "ok";
    const mode = sp.get("mode");
    if (ok) {
      return {
        message:
          mode === "smtp" || mode === "resend"
            ? `Test email sent via ${mode}. Check the inbox.`
            : `Reported success but used "${mode}" mode (no live provider).`,
        tone: mode === "smtp" || mode === "resend" ? "success" : "neutral",
      };
    }
    return { message: `Test email failed (mode: ${mode}).`, tone: "error" };
  }
  if (sp.has("saved")) return { message: "Changes saved.", tone: "success" };
  if (sp.has("error")) return { message: sp.get("error") || "Something went wrong.", tone: "error" };
  return null;
}

const CONSUMED = ["toast", "toastType", "paid", "checked", "r", "test", "mode", "saved", "error"];

export default function Toaster() {
  const [items, setItems] = useState([]);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const timers = useRef(new Map());

  const remove = useCallback((id) => {
    setItems((list) => list.filter((t) => t.id !== id));
    const tm = timers.current.get(id);
    if (tm) {
      clearTimeout(tm);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (item) => {
      setItems((list) => [...list, item]);
      const tm = setTimeout(() => remove(item.id), item.duration ?? 4000);
      timers.current.set(item.id, tm);
    },
    [remove]
  );

  // Client-side toasts (toast() calls).
  useEffect(() => subscribeToasts(push), [push]);

  // Server-redirect toasts (query params) — show, then clean the URL so a
  // refresh doesn't replay the toast.
  useEffect(() => {
    const t = paramsToToast(searchParams);
    if (!t) return;
    push({ id: `p${Date.now()}`, ...t });

    const next = new URLSearchParams(searchParams);
    CONSUMED.forEach((k) => next.delete(k));
    const qs = next.toString();
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    router.replace(pathname + (qs ? `?${qs}` : "") + hash, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, pathname]);

  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-4 pb-24 sm:inset-x-auto sm:right-5 sm:items-end sm:pb-5">
      {items.map((t) => {
        const tone = TONE[t.tone] || TONE.neutral;
        const Icon = tone.icon;
        return (
          <div
            key={t.id}
            role="status"
            className={cx(
              "pointer-events-auto flex w-full max-w-sm animate-toast-in items-start gap-3 rounded-xl border px-4 py-3 shadow-card",
              tone.cls
            )}
          >
            <Icon className={cx("mt-0.5 h-5 w-5 shrink-0", tone.iconCls)} aria-hidden="true" />
            <p className="flex-1 text-sm text-ink">{t.message}</p>
            <button
              onClick={() => remove(t.id)}
              className="-mr-1 -mt-0.5 rounded p-1 text-ink-muted transition hover:bg-paper-dim hover:text-ink"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

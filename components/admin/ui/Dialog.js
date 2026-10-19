"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cx } from "./cx.js";

const Ctx = createContext({ close() {} });
/** Inside a Dialog: { close } — to shut it after a save. */
export const useDialog = () => useContext(Ctx);

/**
 * A button that opens a centered panel. `trigger` is what the button shows
 * (it gets `triggerClassName`); `children` is the panel's content.
 */
export default function Dialog({ title, trigger, triggerClassName, triggerLabel, children, width = 480 }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const esc = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", esc);
      document.body.style.overflow = prev;
    };
  }, [open]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={triggerClassName} aria-label={triggerLabel}>
        {trigger}
      </button>
      {open
        ? createPortal(
            <div
              className="admin-ui fixed inset-0 z-[100] flex items-end justify-center bg-ink/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
              onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className={cx("max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-paper p-5 shadow-2xl sm:rounded-2xl sm:p-6")}
                style={{ maxWidth: width }}
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-ink">{title}</h2>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-muted hover:bg-paper-dim hover:text-ink"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                <Ctx.Provider value={{ close: () => setOpen(false) }}>{children}</Ctx.Provider>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

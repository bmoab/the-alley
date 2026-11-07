"use client";
import { useState } from "react";

/**
 * A page's intro paragraph: on a phone, long ones show two lines and a "More"
 * to read the rest, so the page itself starts higher up. Full on wider screens.
 */
export default function ClampText({ children, className = "" }) {
  const [open, setOpen] = useState(false);
  const long = typeof children === "string" && children.length > 110;
  if (!long) return <p className={className}>{children}</p>;
  return (
    <p className={className}>
      <span className={open ? "" : "line-clamp-2 sm:line-clamp-none"}>{children}</span>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="mt-0.5 text-xs font-semibold text-verde-deep sm:hidden">
          More
        </button>
      ) : null}
    </p>
  );
}

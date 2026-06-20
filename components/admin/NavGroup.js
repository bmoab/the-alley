"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

/**
 * Collapsible admin nav group (e.g. Reservations). Click the label to expand /
 * collapse the child links. Starts open when you're on one of its pages.
 */
export default function NavGroup({ label, items }) {
  const pathname = usePathname();
  const isActive = items.some((i) => pathname === i.href || pathname.startsWith(i.href + "/"));
  const [open, setOpen] = useState(isActive);

  return (
    <div className="lg:mt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm text-paper/75 transition hover:bg-ink-soft hover:text-paper"
      >
        <span>{label}</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          aria-hidden="true"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div className="mt-0.5 flex gap-1 overflow-x-auto lg:flex-col lg:gap-0.5">
          {items.map((sub) => {
            const active = pathname === sub.href || pathname.startsWith(sub.href + "/");
            return (
              <Link
                key={sub.href}
                href={sub.href}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm transition hover:bg-ink-soft hover:text-paper lg:ml-3 ${
                  active ? "bg-ink-soft text-paper" : "text-paper/65"
                }`}
              >
                {sub.label}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

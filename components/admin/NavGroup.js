"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { isActive, groupCount } from "./nav-config.js";
import NavCount from "./NavCount.js";
import { cx } from "./ui/cx.js";

/**
 * Collapsible admin nav group (e.g. Events) for the desktop sidebar.
 * Light theme: charcoal text, verde active state. Starts open when you're on
 * one of its pages.
 */
export default function NavGroup({ label, icon: Icon, items, counts = {} }) {
  const pathname = usePathname();
  const groupActive = items.some((i) => isActive(pathname, i.href));
  const [open, setOpen] = useState(groupActive);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cx(
          "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition",
          groupActive ? "text-ink" : "text-ink-soft hover:bg-paper-dim hover:text-ink"
        )}
      >
        {Icon ? <Icon className="h-[18px] w-[18px] shrink-0" /> : null}
        <span className="flex-1 text-left">{label}</span>
        {/* Folded away, the group shows its pages' total so nothing hides. */}
        {!open ? <NavCount n={groupCount(counts, items)} className="ml-0" /> : null}
        <ChevronDown
          className={cx("h-4 w-4 transition-transform", open ? "rotate-180" : "")}
        />
      </button>
      {open ? (
        <div className="mt-0.5 flex flex-col gap-0.5 pb-1">
          {items.map((sub) => {
            const active = isActive(pathname, sub.href);
            const SubIcon = sub.icon;
            return (
              <Link
                key={sub.href}
                href={sub.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "relative ml-3 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition",
                  active
                    ? "bg-verde/70 font-medium text-ink"
                    : "text-ink-muted hover:bg-paper-dim hover:text-ink"
                )}
              >
                {active ? (
                  <span className="absolute left-0 top-1/2 h-4 w-1 -translate-y-1/2 rounded-r bg-verde-deep" />
                ) : null}
                {SubIcon ? (
                  <SubIcon
                    className={cx(
                      "h-4 w-4 shrink-0",
                      active ? "text-verde-deep" : ""
                    )}
                  />
                ) : null}
                {sub.label}
                <NavCount n={counts[sub.href]} />
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

import Link from "next/link";
import { cx } from "./cx.js";

/**
 * Admin-sized button. Unlike the public-site `.btn` (a big rounded-full pill),
 * this is sized for dense admin UI and comes in semantic variants.
 *
 * Props:
 *   variant: "primary" | "accent" | "ghost" | "danger" | "subtle"  (default primary)
 *   size:    "sm" | "md" | "icon"                                   (default md)
 *   as:      optional element (e.g. Link) — pass `href` for links
 *   full:    stretch to full width
 *   icon:    optional leading lucide icon component
 */
const VARIANTS = {
  primary: "bg-ink text-paper hover:bg-ink-soft border border-transparent",
  accent: "bg-verde text-ink hover:bg-verde-mid border border-transparent",
  ghost:
    "bg-transparent text-ink border border-line-strong hover:border-ink/50 hover:bg-paper-dim",
  subtle:
    "bg-paper-dim text-ink-soft border border-line hover:bg-verde/40 hover:text-ink",
  danger:
    "bg-transparent text-rust border border-rust/30 hover:bg-rust/10",
};

const SIZES = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  icon: "h-9 w-9 justify-center rounded-lg",
};

export default function Button({
  variant = "primary",
  size = "md",
  as,
  href,
  full = false,
  icon: Icon,
  className,
  children,
  ...props
}) {
  const classes = cx(
    "inline-flex items-center font-semibold tracking-wide transition-colors duration-150",
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-verde-deep/50 focus-visible:ring-offset-1 focus-visible:ring-offset-paper",
    "disabled:opacity-50 disabled:pointer-events-none",
    VARIANTS[variant] || VARIANTS.primary,
    SIZES[size] || SIZES.md,
    full && "w-full justify-center",
    className
  );

  const inner = (
    <>
      {Icon ? <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
      {children}
    </>
  );

  if (href) {
    const Cmp = as || Link;
    return (
      <Cmp href={href} className={classes} {...props}>
        {inner}
      </Cmp>
    );
  }

  return (
    <button className={classes} {...props}>
      {inner}
    </button>
  );
}

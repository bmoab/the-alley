import Link from "next/link";
import { cx } from "./cx.js";
import { upperFirst } from "@/lib/constants.js";

/**
 * Dashboard stat tile: big number + label + hint, with an optional icon chip.
 * Clickable when `href` is provided. Extracted from the inline StatCard that
 * lived in app/admin/(dash)/page.js.
 */
export default function StatCard({ label, value, href, hint, icon: Icon, accent, className }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="text-2xl font-semibold tabular-nums text-ink sm:text-3xl">{value}</div>
        {Icon ? (
          <span
            className={cx(
              "flex h-9 w-9 items-center justify-center rounded-xl",
              accent ? "bg-verde-deep/15 text-verde-deep" : "bg-verde/60 text-ink-soft"
            )}
          >
            <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <div className="mt-2 text-sm font-semibold text-ink-soft">{label}</div>
      {hint ? <div className="mt-0.5 text-xs text-ink-muted">{typeof hint === "string" ? upperFirst(hint) : hint}</div> : null}
    </>
  );

  const classes =
    cx("card block p-4 sm:p-5 transition duration-200 hover:-translate-y-0.5 hover:shadow-card-hover hover:border-verde-deep/40", className);

  if (href) {
    return (
      <Link href={href} className={classes}>
        {body}
      </Link>
    );
  }
  return <div className={cx("card p-4 sm:p-5", className)}>{body}</div>;
}

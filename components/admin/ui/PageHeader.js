import { cx } from "./cx.js";

/**
 * Standard admin page header: sage eyebrow + title + subtitle, with an
 * optional right-aligned actions slot. Replaces the hand-written 3-line
 * header that was duplicated on every admin page.
 */
export default function PageHeader({
  eyebrow = "Admin",
  title,
  subtitle,
  actions,
  className,
}) {
  return (
    <div
      className={cx(
        "mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className
      )}
    >
      <div className="animate-fade-in-up">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1 className="mt-1 text-2xl font-semibold text-ink sm:text-3xl">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 max-w-prose text-sm text-ink-muted">{subtitle}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

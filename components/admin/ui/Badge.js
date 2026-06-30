import { cx } from "./cx.js";

/**
 * Status-aware pill. Centralizes the STATUS_STYLES map that was duplicated in
 * bookings/page.js so requests, deposits, events, etc. all match.
 *
 * Use <Badge status="confirmed" /> for booking statuses, or
 * <Badge tone="success">Paid</Badge> for ad-hoc labels.
 */
const STATUS_STYLES = {
  held: "bg-amber-100 text-amber-800 border-amber-200",
  reserved: "bg-sky-100 text-sky-800 border-sky-200",
  pending: "bg-paper-warm text-ink-muted border-line",
  confirmed: "bg-verde/60 text-ink border-verde-deep/30",
  completed: "bg-ink/10 text-ink-soft border-ink/15",
  denied: "bg-rust/10 text-rust border-rust/25",
  expired: "bg-rust/10 text-rust border-rust/25",
  paid: "bg-verde/60 text-ink border-verde-deep/30",
  live: "bg-verde-deep/15 text-verde-deep border-verde-deep/30",
  draft: "bg-paper-warm text-ink-muted border-line",
};

const TONE_STYLES = {
  neutral: "bg-paper-warm text-ink-muted border-line",
  success: "bg-verde/60 text-ink border-verde-deep/30",
  sage: "bg-verde-deep/15 text-verde-deep border-verde-deep/30",
  warning: "bg-amber-100 text-amber-800 border-amber-200",
  danger: "bg-rust/10 text-rust border-rust/25",
  ink: "bg-ink/10 text-ink-soft border-ink/15",
};

export default function Badge({ status, tone, children, className }) {
  const style =
    (status && STATUS_STYLES[status]) ||
    (tone && TONE_STYLES[tone]) ||
    TONE_STYLES.neutral;

  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize",
        style,
        className
      )}
    >
      {children ?? status}
    </span>
  );
}

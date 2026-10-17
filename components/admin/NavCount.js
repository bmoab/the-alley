import { cx } from "./ui/cx.js";

/**
 * The little bubble beside a nav item: how many things there need someone.
 * Nothing at all when the count is zero — an empty 0 is just noise.
 */
export default function NavCount({ n, className }) {
  if (!n) return null;
  return (
    <span
      className={cx(
        "ml-auto inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rust px-1.5 text-[11px] font-semibold leading-none text-paper tabular-nums",
        className
      )}
      aria-label={`${n} waiting`}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}

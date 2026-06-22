import Link from "next/link";
import { cx } from "./cx.js";

const PAD = {
  none: "",
  sm: "p-4",
  md: "p-5",
  lg: "p-6",
};

/**
 * Airy admin surface. Uses the `.card` class (restyled for admin in
 * globals.css). Pass `href` to make it a clickable Link with a hover lift.
 */
export default function Card({
  as,
  href,
  pad = "md",
  hover = false,
  className,
  children,
  ...props
}) {
  const classes = cx(
    "card",
    PAD[pad] ?? PAD.md,
    (hover || href) &&
      "transition duration-200 hover:-translate-y-0.5 hover:shadow-card-hover hover:border-verde-deep/40",
    className
  );

  if (href) {
    const Cmp = as || Link;
    return (
      <Cmp href={href} className={cx("block", classes)} {...props}>
        {children}
      </Cmp>
    );
  }

  const Cmp = as || "div";
  return (
    <Cmp className={classes} {...props}>
      {children}
    </Cmp>
  );
}

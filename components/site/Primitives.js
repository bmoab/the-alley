/**
 * Small presentational primitives shared across the public site.
 * Server-safe (no hooks). Styling lives in app/(site)/site.css.
 */

/** Thin vertical stripes motif (uses currentColor). */
export function Stripes({ className = "", count = 4 }) {
  return (
    <div className={`stripes ${className}`.trim()} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <i key={i} />
      ))}
    </div>
  );
}

/** Hand-drawn lightning bolt mark. */
export function Bolt({ className = "", width = 22, height = 30 }) {
  return (
    <svg
      className={`bolt-mark ${className}`.trim()}
      width={width}
      height={height}
      viewBox="0 0 24 32"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M14 1 4 18h6l-2 13 12-19h-7l3-11Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/** Arrow used in CTAs / rule-links. */
export function Arrow() {
  return <span className="arrow" aria-hidden="true">→</span>;
}

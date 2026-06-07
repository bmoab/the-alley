/**
 * Decorative image placeholder used until real photos are uploaded.
 * If `src` is provided, renders the actual image instead.
 */
const GRADIENTS = [
  "from-brass/30 to-ink/25",
  "from-ink/30 to-paper-warm",
  "from-ink/25 to-brass/25",
  "from-brass-light/40 to-ink/20",
];

export default function Placeholder({ src, alt = "", label, seed = 0, className = "", rounded = "rounded-2xl" }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt={alt}
        className={`${rounded} object-cover ${className}`}
      />
    );
  }
  const g = GRADIENTS[Math.abs(seed) % GRADIENTS.length];
  return (
    <div
      className={`flex items-center justify-center bg-gradient-to-br ${g} ${rounded} ${className}`}
      aria-label={alt || label}
    >
      {label ? (
        <span className="px-3 text-center font-display text-sm font-semibold text-ink/50">
          {label}
        </span>
      ) : (
        <span className="text-2xl text-ink/30">✦</span>
      )}
    </div>
  );
}

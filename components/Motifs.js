/**
 * Recurring graphic motifs from alleyoncenter.com:
 *  - <Bolt/>     a small lightning-bolt accent mark
 *  - <Stripes/>  three thin vertical lines (used beside imagery / as dividers)
 *  - <AlleyBadge/> the circular "ALLEY ON CENTER" emblem (footer)
 *  - <VerticalWordmark/> the tall "ALLEY" wordmark for the left margin
 */

export function Bolt({ className = "h-4 w-4", stroke = "currentColor" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M14 2 4 14h6l-1 8 11-13h-7l1-7Z"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function Stripes({ className = "", count = 3, color = "currentColor" }) {
  return (
    <div className={`flex gap-1.5 ${className}`} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className="block w-0.5 self-stretch"
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}

export function VerticalWordmark({ text = "ALLEY", className = "" }) {
  return (
    <div
      className={`wordmark-vertical font-display text-xs font-bold uppercase ${className}`}
      aria-hidden="true"
    >
      {text}
    </div>
  );
}

export function AlleyBadge({ className = "h-20 w-20" }) {
  // Circular emblem: "THE ALLEY ON CENTER" around a central lightning bolt.
  return (
    <svg viewBox="0 0 120 120" className={className} aria-label="The Alley On Center">
      <defs>
        <path id="badge-arc-top" d="M 18,60 A 42,42 0 0 1 102,60" />
        <path id="badge-arc-bot" d="M 102,60 A 42,42 0 0 1 18,60" />
      </defs>
      <circle cx="60" cy="60" r="57" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="60" cy="60" r="46" fill="none" stroke="currentColor" strokeWidth="0.75" opacity="0.6" />
      <text fill="currentColor" fontSize="9" fontWeight="700" letterSpacing="3" fontFamily="var(--font-display)">
        <textPath href="#badge-arc-top" startOffset="50%" textAnchor="middle">THE ALLEY</textPath>
      </text>
      <text fill="currentColor" fontSize="9" fontWeight="700" letterSpacing="3" fontFamily="var(--font-display)">
        <textPath href="#badge-arc-bot" startOffset="50%" textAnchor="middle">ON CENTER</textPath>
      </text>
      <path
        d="M64 38 50 64h8l-2 18 16-22h-9l3-10Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

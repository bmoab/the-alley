/**
 * Styled "Follow us on Instagram" button. Links out to the handle stored in
 * site content (social_instagram). Renders nothing if no URL is set.
 */
function InstagramGlyph({ className = "h-5 w-5" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="17.5" cy="6.5" r="1.1" fill="currentColor" />
    </svg>
  );
}

function handleFromUrl(url = "") {
  const m = url.replace(/\/+$/, "").match(/instagram\.com\/([^/?#]+)/i);
  return m ? `@${m[1]}` : "Instagram";
}

export default function InstagramButton({ url, className = "" }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center gap-2.5 rounded-full bg-gradient-to-br from-brass to-rust px-6 py-3 font-semibold text-paper transition hover:opacity-90 ${className}`}
    >
      <InstagramGlyph />
      Follow us on Instagram
      <span className="font-normal text-paper/80">{handleFromUrl(url)}</span>
    </a>
  );
}

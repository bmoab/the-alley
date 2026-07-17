/**
 * PhotoSlot — the public-site image cell.
 *
 * Renders the brand's duotone placeholder (`.photo`) with an optional tracked
 * caption tag. When a real uploaded image `src` is present it fills the cell
 * (object-cover) and the duotone sits behind it. `variant` tints the
 * placeholder ("" | "verde" | "soft"); `ar` sets an aspect-ratio.
 *
 * Server component (no interactivity) so it can be used inside server pages.
 */
export default function PhotoSlot({
  src,
  alt = "",
  tag,
  variant = "",
  ar,
  className = "",
  style = {},
  showTag = true,
  objectFit,
  objectPosition,
}) {
  const variantClass = variant === "verde" ? "photo--verde" : variant === "soft" ? "photo--soft" : "";
  const css = { ...style };
  if (ar) css.aspectRatio = ar;
  // Owner-set framing (Site Photos): override the default cover crop / centering.
  const imgStyle = {};
  if (objectFit) imgStyle.objectFit = objectFit;
  if (objectPosition) imgStyle.objectPosition = objectPosition;
  return (
    <div className={`photo ${variantClass} ${className}`.trim()} style={css}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="photo__img" src={src} alt={alt || tag || ""} loading="lazy" style={imgStyle} />
      ) : null}
      {showTag && tag ? (
        <div className="photo__tag">
          <CameraGlyph />
          <span>{tag}</span>
        </div>
      ) : null}
    </div>
  );
}

function CameraGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 8a2 2 0 0 1 2-2h2l1.2-1.6a1 1 0 0 1 .8-.4h6a1 1 0 0 1 .8.4L19 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <circle cx="12" cy="12.5" r="3.2" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

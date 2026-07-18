// Shared crop math for the homepage hero banner. A crop is an arbitrary
// rectangle of the *source* photo, stored as fractions of the natural image:
//   { x, y, w, h, nw, nh }
//     x,y  top-left of the box   (0..1 of the source)
//     w,h  box size              (0..1 of the source)
//     nw,nh natural pixel dims of the source (for aspect ratio)
//
// The banner is always full width, so the box's shape decides the banner's
// height. We render that exact rectangle — scaled to fill the container — with
// a background image (no distortion, because the container's aspect-ratio is set
// to the box's aspect). The editor preview and the live homepage use this same
// function so what the owner frames is exactly what ships.

// The banner is full-width; clamp the box's aspect (width:height, in real
// pixels) so the resulting banner height stays sensible on every screen.
export const HERO_MIN_ASPECT = 2.0; // tallest allowed band (≈600px at 1240 wide)
export const HERO_MAX_ASPECT = 5.0; // shortest / most cinematic band

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function parseCrop(raw) {
  if (!raw) return null;
  let c = raw;
  if (typeof raw === "string") {
    try {
      c = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!c || typeof c !== "object") return null;
  const nums = [c.x, c.y, c.w, c.h, c.nw, c.nh];
  if (!nums.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  if (c.w <= 0 || c.h <= 0 || c.nw <= 0 || c.nh <= 0) return null;
  return { x: c.x, y: c.y, w: c.w, h: c.h, nw: c.nw, nh: c.nh };
}

/** Real-pixel aspect ratio (width ÷ height) of a crop box. */
export function cropAspect(c) {
  return (c.w * c.nw) / (c.h * c.nh);
}

/** A sensible starting box for a fresh photo: a centered, full-width ~2.5:1 band. */
export function defaultCrop(nw, nh) {
  const target = 2.5;
  let w = 1;
  let h = nw / (target * nh);
  if (h > 1) {
    h = 1;
    w = (target * nh) / nw;
  }
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h, nw, nh };
}

/**
 * Recompute a crop box after dragging corner `handle` ("nw"|"ne"|"sw"|"se") by
 * (ddx,ddy) fractions of the source. Keeps the box inside the image and its
 * width:height aspect within [HERO_MIN_ASPECT, HERO_MAX_ASPECT]; the corner
 * opposite the handle stays anchored. Pure — shared by the editor + tests.
 */
export function resizeCrop(handle, start, ddx, ddy, nw, nh) {
  const MINW = Math.min(0.15, 48 / nw);
  const MINH = Math.min(0.15, 48 / nh);
  let left = start.x;
  let right = start.x + start.w;
  let top = start.y;
  let bottom = start.y + start.h;

  if (handle.includes("e")) right = clamp(start.x + start.w + ddx, left + MINW, 1);
  if (handle.includes("w")) left = clamp(start.x + ddx, 0, right - MINW);
  if (handle.includes("s")) bottom = clamp(start.y + start.h + ddy, top + MINH, 1);
  if (handle.includes("n")) top = clamp(start.y + ddy, 0, bottom - MINH);

  let w = right - left;
  let h = bottom - top;
  const fixedLeft = !handle.includes("w");
  const fixedTop = !handle.includes("n");

  const asp = (w * nw) / (h * nh);
  const target = clamp(asp, HERO_MIN_ASPECT, HERO_MAX_ASPECT);
  if (target !== asp) {
    const hNew = (w * nw) / (target * nh);
    if (fixedTop) bottom = Math.min(1, top + hNew);
    else top = Math.max(0, bottom - hNew);
    h = bottom - top;
    const asp2 = (w * nw) / (h * nh);
    if (asp2 < HERO_MIN_ASPECT || asp2 > HERO_MAX_ASPECT) {
      const wNew = (target * h * nh) / nw;
      if (fixedLeft) right = Math.min(1, left + wNew);
      else left = Math.max(0, right - wNew);
      w = right - left;
    }
  }
  return { x: left, y: top, w, h, nw, nh };
}

/**
 * Inline style that renders crop `c` of image `src` filling its container at the
 * box's own aspect ratio. Container should be `width:100%; overflow:hidden`.
 */
export function cropBackgroundStyle(src, c) {
  const posX = c.w >= 0.999 ? 50 : clamp((c.x / (1 - c.w)) * 100, 0, 100);
  const posY = c.h >= 0.999 ? 50 : clamp((c.y / (1 - c.h)) * 100, 0, 100);
  return {
    aspectRatio: `${c.w * c.nw} / ${c.h * c.nh}`,
    backgroundImage: `url("${src}")`,
    backgroundSize: `${100 / c.w}% ${100 / c.h}%`,
    backgroundPosition: `${posX}% ${posY}%`,
    backgroundRepeat: "no-repeat",
  };
}

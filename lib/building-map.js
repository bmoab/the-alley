/**
 * Interactive building directory geometry (fixed config).
 *
 * Suite rectangles are in each plan's NATIVE PIXEL SPACE, matching the actual
 * artwork dimensions in /public/brand:
 *   building-front.webp  1977 × 1427
 *   floor-lower.webp     1811 × 821
 *   floor-upper.webp     1811 × 821
 *
 * Alignment: render each SVG with `viewBox` equal to the image's coordinate
 * system and draw the <image> filling it, so the zone <rect>s line up exactly
 * with the drawn rooms. (The earlier demo drifted because the viewBox didn't
 * match native pixel space — keep BUILDING_MAP.front.vb / floor w,h in sync
 * with the assets if the art is ever re-exported.)
 *
 * Tenants attach to a suite by matching `directory.suite` to a suite `code`.
 * An unmatched suite renders as available-to-lease. `kind`:
 *   "open"  → open-to-all space (the gallery)
 *   "loft"  → the rentable loft
 *   (none)  → a normal leasable suite
 */
export const BUILDING_MAP = {
  front: {
    img: "/brand/building-front.webp",
    imgW: 1977,
    imgH: 1427,
    vb: "7 0 1756 1427",
    bands: [
      { floor: "upper", name: "Upper Floor", sub: "Studios & offices · 201–205 + The Loft", x: 7, y: 0, w: 1756, h: 745 },
      { floor: "lower", name: "Lower Floor", sub: "Storefronts & the gallery · 100–105", x: 7, y: 745, w: 1756, h: 682 },
    ],
  },
  floors: [
    {
      id: "lower",
      name: "Lower Floor",
      img: "/brand/floor-lower.webp",
      w: 1811,
      h: 821,
      suites: [
        { code: "gallery", x: 305, y: 20, w: 835, h: 410, kind: "open" },
        { code: "101", x: 1158, y: 18, w: 322, h: 145 },
        { code: "100", x: 1483, y: 18, w: 305, h: 242 },
        { code: "102", x: 888, y: 538, w: 186, h: 278 },
        { code: "103", x: 682, y: 538, w: 202, h: 278 },
        { code: "104", x: 488, y: 538, w: 190, h: 278 },
        { code: "105", x: 300, y: 538, w: 184, h: 278 },
      ],
    },
    {
      id: "upper",
      name: "Upper Floor",
      img: "/brand/floor-upper.webp",
      w: 1811,
      h: 821,
      suites: [
        { code: "200", x: 1090, y: 30, w: 705, h: 620, kind: "loft" },
        { code: "203", x: 290, y: 30, w: 165, h: 248 },
        { code: "202", x: 458, y: 30, w: 222, h: 248 },
        { code: "201", x: 802, y: 30, w: 263, h: 248 },
        { code: "204", x: 290, y: 528, w: 395, h: 288 },
        { code: "205", x: 685, y: 528, w: 205, h: 288 },
      ],
    },
  ],
};

/** Flat list of all suite codes (for the admin suite dropdown). */
export const SUITE_CODES = BUILDING_MAP.floors.flatMap((f) =>
  f.suites.map((s) => ({ code: s.code, floor: f.id, kind: s.kind || null }))
);

export function getFloor(id) {
  return BUILDING_MAP.floors.find((f) => f.id === id) || null;
}

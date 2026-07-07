/**
 * Interactive building directory geometry (fixed config).
 *
 * Suite rectangles are in each plan's SVG viewBox SPACE, matching the source
 * vector art (the floor images are rendered from those SVGs at 2×):
 *   building-front.webp  1977 × 1427   (front elevation — unchanged)
 *   floor-lower.webp     1801.09 × 819.55   (First Floor.svg)
 *   floor-upper.webp     1748.02 × 819.55   (Second floor.svg)
 *
 * Alignment: each floor's w/h equals its SVG viewBox, the <image> fills that
 * viewBox, and every zone <rect> is derived from the SVG's own wall geometry —
 * so they line up exactly. If the art is ever re-exported, keep each floor's
 * w/h equal to the new viewBox and re-derive the rects from the vector.
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
      { floor: "upper", name: "Upper Floor", sub: "Studios & offices · 201–203, 205 + The Loft", x: 7, y: 0, w: 1756, h: 745 },
      { floor: "lower", name: "Lower Floor", sub: "Storefronts & the main floor · 000, 100–105", x: 7, y: 745, w: 1756, h: 682 },
    ],
  },
  floors: [
    {
      id: "lower",
      name: "Lower Floor",
      img: "/brand/floor-lower.webp",
      w: 1801.09,
      h: 819.55,
      // "gallery" (kept as the code so existing suite/space data stays linked)
      // is the bookable open Main Floor. 000 is the former utility room, now a
      // leasable suite. Rects derived from First Floor.svg wall geometry.
      suites: [
        { code: "gallery", x: 300, y: 15, w: 850, h: 510, kind: "open", space: "main" },
        { code: "101", x: 1167, y: 11, w: 281, h: 141 },
        { code: "100", x: 1460, y: 11, w: 277, h: 255 },
        { code: "102", x: 890, y: 550, w: 182, h: 259 },
        { code: "103", x: 692, y: 549, w: 186, h: 259 },
        { code: "104", x: 496, y: 548, w: 184, h: 260 },
        { code: "105", x: 298, y: 547, w: 186, h: 261 },
        { code: "000", x: 1084, y: 595, w: 233, h: 135 },
      ],
    },
    {
      id: "upper",
      name: "Upper Floor",
      img: "/brand/floor-upper.webp",
      w: 1748.02,
      h: 819.55,
      // "200" (kept as the code) is The Alley Loft. Suite 204 was retired when
      // the floor was redrawn (now Conference Room / Common Space — labels only,
      // not interactive). Rects derived from Second floor.svg wall geometry.
      suites: [
        { code: "200", x: 1058, y: 15, w: 678, h: 780, kind: "loft", space: "loft" },
        { code: "203", x: 298, y: 11, w: 198, h: 253 },
        { code: "202", x: 509, y: 11, w: 179, h: 253 },
        { code: "201", x: 842, y: 11, w: 226, h: 253 },
        { code: "205", x: 699, y: 539, w: 187, h: 269 },
      ],
    },
  ],
};

/** Flat list of all suite codes (for the admin suite dropdown). */
export const SUITE_CODES = BUILDING_MAP.floors.flatMap((f) =>
  f.suites.map((s) => ({ code: s.code, floor: f.id, kind: s.kind || null, space: s.space || null }))
);

export function getFloor(id) {
  return BUILDING_MAP.floors.find((f) => f.id === id) || null;
}

/** If a zone IS one of the two rentable spaces, return its space id ("main"|"loft"). */
export function zoneSpace(zone) {
  for (const f of BUILDING_MAP.floors) {
    const s = f.suites.find((x) => x.code === zone);
    if (s) return s.space || null;
  }
  return null;
}

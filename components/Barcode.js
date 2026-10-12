import { code128 } from "@/lib/barcode.js";

/**
 * Code 128 barcode as inline SVG for printed price tags.
 *
 * SVG (not canvas/PNG) so it prints at full printer resolution, and no hooks so
 * it renders on the server. Width defaults to modules × moduleWidth because
 * scanners care about the narrowest bar's physical size, not the tag's size.
 */
export default function Barcode({ value, height = "0.5in", width, moduleWidth = "0.015in", className }) {
  let code;
  try {
    code = code128(String(value ?? ""));
  } catch {
    return null; // an unscannable tag is worse than none
  }

  let w = width;
  if (!w) {
    const m = /^([\d.]+)([a-z%]*)$/i.exec(moduleWidth);
    const n = m ? Number(m[1]) * code.modules : code.modules;
    w = `${Number(n.toFixed(4))}${m ? m[2] : "px"}`;
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${code.modules} 100`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      width={w}
      height={height}
      className={className}
      role="img"
      aria-label={value}
    >
      {code.bars.map((b) => (
        <rect key={b.x} x={b.x} y={0} width={b.w} height={100} fill="#000" />
      ))}
    </svg>
  );
}

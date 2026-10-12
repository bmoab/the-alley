import QRCode from "qrcode";

/**
 * QR code as inline SVG for printed price tags — the same number the barcode
 * carries (the item's SKU), so the register finds the item either way.
 *
 * Built from the module grid rather than the library's SVG string so it renders
 * on the server with no async and prints at full printer resolution. The
 * 4-module quiet zone is part of the drawing: keep the tag's own padding out
 * of it and a scanner still gets the white border it needs.
 */
export default function QrCode({ value, size = "0.75in", className }) {
  let qr;
  try {
    qr = QRCode.create(String(value ?? ""), { errorCorrectionLevel: "M" });
  } catch {
    return null;
  }
  const n = qr.modules.size;
  const quiet = 4;
  const cells = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (qr.modules.get(x, y)) cells.push(`M${x + quiet} ${y + quiet}h1v1h-1z`);
    }
  }
  const total = n + quiet * 2;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${total} ${total}`}
      shapeRendering="crispEdges"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={value}
    >
      <path d={cells.join("")} fill="#000" />
    </svg>
  );
}

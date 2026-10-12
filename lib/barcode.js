/**
 * Dependency-free Code 128 encoder for printed price tags.
 *
 * Code 128 because every Square-compatible scanner (USB/Bluetooth keyboard
 * wedges and the iPad camera) reads it out of the box, and all-digit SKUs pack
 * two digits per symbol in Code Set C, keeping tags narrow enough to scan.
 *
 * Returns geometry only (module units) so the same output can drive SVG on the
 * server or client. Pure — no imports — so it's safe anywhere.
 */

// Bar/space widths for symbol values 0–106, from the ISO/IEC 15417 table.
// Each symbol is 11 modules; 106 (stop) is 13.
const PATTERNS = (
  "212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 " +
  "221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 " +
  "221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 " +
  "212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 " +
  "231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 " +
  "231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 " +
  "314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 " +
  "112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 " +
  "111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 " +
  "214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 " +
  "114131 311141 411131 211412 211214 211232 2331112"
).split(" ");

const START_B = 104;
const START_C = 105;
const CODE_C = 99; // switch from B to C mid-symbol
const STOP = 106;
const QUIET = 10; // scanners need ≥10 modules of blank margin each side

// Symbol values (start … data, no checksum/stop) for `text`.
function symbolValues(text) {
  if (typeof text !== "string" || text.length === 0) {
    throw new Error("code128: empty value");
  }
  if (/^\d+$/.test(text)) {
    // Odd-length digit strings: one char in B, then the rest as C pairs —
    // still far narrower than all-B for long SKUs.
    const odd = text.length % 2 === 1;
    const values = odd
      ? [START_B, text.charCodeAt(0) - 32, ...(text.length > 1 ? [CODE_C] : [])]
      : [START_C];
    for (let i = odd ? 1 : 0; i < text.length; i += 2) {
      values.push(Number(text.slice(i, i + 2)));
    }
    return values;
  }
  const values = [START_B];
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if (c < 32 || c > 126) {
      throw new Error(`code128: unsupported character ${JSON.stringify(ch)}`);
    }
    values.push(c - 32);
  }
  return values;
}

export function code128(text) {
  const values = symbolValues(text);
  // Start symbol counts at weight 1 too, so i || 1 covers both.
  const check = values.reduce((sum, v, i) => sum + v * (i || 1), 0) % 103;
  values.push(check, STOP);

  const bars = [];
  let x = QUIET;
  for (const v of values) {
    const p = PATTERNS[v];
    for (let i = 0; i < p.length; i++) {
      const w = Number(p[i]);
      if (i % 2 === 0) bars.push({ x, w }); // even positions are bars
      x += w;
    }
  }
  return { modules: x + QUIET, bars };
}

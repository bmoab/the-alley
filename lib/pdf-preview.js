import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

/**
 * Pictures of an uploaded PDF's pages (server-only), so a flyer or menu sent
 * as a PDF shows on the event page like a photo instead of as a download link
 * with a random file name.
 *
 * Rendered once, the first time a page asks, with pdf.js onto a canvas and
 * saved as WebP under UPLOAD_DIR/pdf-previews/<pdf name>-p<N>.webp, beside a
 * small <pdf name>.json listing them. Later visits just read the list. If a
 * PDF can't be rendered the list says so and the page falls back to a link.
 *
 * The previews sit in a subfolder the orphan sweeper's top-level scan never
 * reaches; sweepOrphanPreviews() clears the ones whose PDF is gone.
 */

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "public", "uploads");
const PREVIEW_DIR = path.join(UPLOAD_DIR, "pdf-previews");
const MANAGED_PDF = /^\/uploads\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.pdf$/i;
const MAX_PAGES = 8;
const WIDTH = 1600; // px — sharp on a phone, readable full-screen
const VERSION = 1; // bump to re-render everything

const inFlight = globalThis.__alleyPdfPreviews || (globalThis.__alleyPdfPreviews = new Map());

async function render(pdfFile, id) {
  const require = createRequire(import.meta.url);
  const pdfjsDir = path.dirname(require.resolve("pdfjs-dist/package.json"));
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { createCanvas } = await import("@napi-rs/canvas");
  const sharp = (await import("sharp")).default;

  const task = pdfjs.getDocument({
    data: new Uint8Array(fs.readFileSync(pdfFile)),
    standardFontDataUrl: path.join(pdfjsDir, "standard_fonts") + path.sep,
    cMapUrl: path.join(pdfjsDir, "cmaps") + path.sep,
    cMapPacked: true,
    isEvalSupported: false,
    verbosity: 0,
  });
  const doc = await task.promise;
  try {
    fs.mkdirSync(PREVIEW_DIR, { recursive: true });
    const pages = [];
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      // Width-limited, and height-limited too so a freakishly tall page can't eat memory.
      const viewport = page.getViewport({ scale: Math.min(WIDTH / base.width, (WIDTH * 4) / base.height) });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext("2d");
      // PDFs have no background of their own; without this a page renders transparent.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      const name = `${id}-p${n}.webp`;
      fs.writeFileSync(path.join(PREVIEW_DIR, name), await sharp(canvas.toBuffer("image/png")).webp({ quality: 82 }).toBuffer());
      pages.push({ src: `/uploads/pdf-previews/${name}`, width: canvas.width, height: canvas.height });
      page.cleanup();
    }
    return { version: VERSION, pages, totalPages: doc.numPages };
  } finally {
    await task.destroy();
  }
}

/**
 * The page images for one uploaded PDF (its public path, e.g. "/uploads/….pdf"):
 * [{ src, width, height }], or [] when it isn't ours or won't render.
 */
export async function pdfPreview(publicPath) {
  const m = MANAGED_PDF.exec(String(publicPath || ""));
  if (!m) return [];
  const id = m[1].toLowerCase();
  const manifest = path.join(PREVIEW_DIR, `${id}.json`);
  try {
    const saved = JSON.parse(fs.readFileSync(manifest, "utf8"));
    if (saved.version === VERSION) return saved.pages || [];
  } catch {}
  const pdfFile = path.join(UPLOAD_DIR, `${id}.pdf`);
  if (!fs.existsSync(pdfFile)) return [];

  if (!inFlight.has(id)) {
    inFlight.set(
      id,
      render(pdfFile, id)
        .catch((err) => {
          console.error(`[pdf-preview] ${id}.pdf didn't render: ${err.message}`);
          return { version: VERSION, pages: [], failed: true };
        })
        .then((result) => {
          try {
            fs.mkdirSync(PREVIEW_DIR, { recursive: true });
            fs.writeFileSync(manifest, JSON.stringify(result));
          } catch (err) {
            console.error(`[pdf-preview] couldn't save the list for ${id}: ${err.message}`);
          }
          return result;
        })
        .finally(() => inFlight.delete(id))
    );
  }
  return (await inFlight.get(id)).pages;
}

/** The first page of an event's first PDF (its pdf_paths JSON), for a card with no photo. Null when there's none. */
export async function pdfCover(pdfPathsJson) {
  let paths = [];
  try {
    paths = JSON.parse(pdfPathsJson || "[]");
  } catch {}
  for (const p of Array.isArray(paths) ? paths : []) {
    const pages = await pdfPreview(p);
    if (pages.length) return pages[0].src;
  }
  return null;
}

/** Previews whose PDF is no longer on disk. Returns how many files were removed. */
export function sweepOrphanPreviews() {
  if (!fs.existsSync(PREVIEW_DIR)) return 0;
  let removed = 0;
  for (const name of fs.readdirSync(PREVIEW_DIR)) {
    const id = name.match(/^([0-9a-f-]{36})(?:-p\d+\.webp|\.json)$/i)?.[1];
    if (!id || fs.existsSync(path.join(UPLOAD_DIR, `${id.toLowerCase()}.pdf`))) continue;
    fs.rmSync(path.join(PREVIEW_DIR, name), { force: true });
    removed++;
  }
  return removed;
}

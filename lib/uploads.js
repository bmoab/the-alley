import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Local-filesystem upload storage.
 *
 * Files are written to UPLOAD_DIR and served at /uploads/<name>.
 *  - Default (dev): ./public/uploads, served statically by Next.
 *  - Production (Railway): set UPLOAD_DIR to a folder on the persistent volume,
 *    e.g. /data/uploads, and symlink it into public/uploads at startup so Next
 *    keeps serving /uploads/* (see DEPLOY.md). Files then survive restarts.
 * Swapping to S3/cloud later means reimplementing only `saveUpload()` to return
 * a remote URL — callers just store whatever string path it returns.
 *
 * Images are DOWNSCALED AND RE-ENCODED before they hit the disk. This matters:
 * on 2026-09-21 the 500 MB volume filled up entirely on raw camera uploads
 * (158 files averaging 2.65 MB, one of them 6000×4000px), which took the whole
 * admin down — SQLite can't write when the disk is full. A 24-megapixel photo
 * also costs every visitor the full download. Storing a 2000px WebP instead is
 * visually identical on a web page and roughly a tenth of the bytes.
 */

const UPLOAD_DIR =
  process.env.UPLOAD_DIR || path.join(process.cwd(), "public", "uploads");

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const PDF_TYPES = new Set(["application/pdf"]);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

// Longest edge kept after downscaling. 2000px covers full-bleed hero images on
// a retina display; nothing on the site is laid out wider than that.
const MAX_DIMENSION = Math.max(200, Number(process.env.UPLOAD_MAX_DIMENSION) || 2000);
const WEBP_QUALITY = Math.min(100, Math.max(1, Number(process.env.UPLOAD_WEBP_QUALITY) || 82));

function ext(name = "", type = "") {
  const fromName = path.extname(name).toLowerCase();
  if (fromName) return fromName;
  if (type === "image/jpeg") return ".jpg";
  if (type === "image/png") return ".png";
  if (type === "image/webp") return ".webp";
  if (type === "image/gif") return ".gif";
  if (type === "application/pdf") return ".pdf";
  return "";
}

/**
 * Downscale + re-encode an image to WebP. Returns null when the image should be
 * stored as-is (animated GIFs, or anything sharp can't handle).
 *
 * sharp is imported lazily so that a missing/broken native binary degrades to
 * "store the original" instead of taking down every upload route.
 */
async function compressImage(buffer, type) {
  // Animated GIFs lose their animation through this path; leave them alone.
  if (type === "image/gif") return null;

  const sharp = (await import("sharp")).default;
  return sharp(buffer, { failOn: "none" })
    // Apply the EXIF orientation flag BEFORE re-encoding — the output drops
    // metadata, so a phone photo would otherwise come out rotated.
    .rotate()
    .resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
}

/**
 * Save a web File (from request.formData()). `kind` is "image" | "pdf".
 * Returns the public path (e.g. "/uploads/ab12.webp") or throws on bad input.
 */
export async function saveUpload(file, kind = "image") {
  if (!file || typeof file.arrayBuffer !== "function" || file.size === 0) {
    return null;
  }
  if (file.size > MAX_BYTES) {
    throw new Error("File is too large (max 10 MB).");
  }
  const allowed = kind === "pdf" ? PDF_TYPES : IMAGE_TYPES;
  if (file.type && !allowed.has(file.type)) {
    throw new Error(
      kind === "pdf" ? "Only PDF files are allowed." : "Only image files are allowed."
    );
  }

  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  let buffer = Buffer.from(await file.arrayBuffer());
  let extension = ext(file.name, file.type);

  if (kind !== "pdf") {
    try {
      const compressed = await compressImage(buffer, file.type);
      // Only take the re-encode if it actually saved space — a small, already
      // optimized image can come out bigger than it went in.
      if (compressed && compressed.length < buffer.length) {
        console.log(
          `[uploads] ${file.name || "image"}: ${Math.round(buffer.length / 1024)} KB → ` +
            `${Math.round(compressed.length / 1024)} KB webp`
        );
        buffer = compressed;
        extension = ".webp";
      }
    } catch (err) {
      // Never fail an upload over compression — store what we were given.
      console.error(`[uploads] compression failed, storing original: ${err.message}`);
    }
  }

  const filename = `${randomUUID()}${extension}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);
  return `/uploads/${filename}`;
}

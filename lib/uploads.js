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
 */

const UPLOAD_DIR =
  process.env.UPLOAD_DIR || path.join(process.cwd(), "public", "uploads");

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const PDF_TYPES = new Set(["application/pdf"]);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

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
 * Save a web File (from request.formData()). `kind` is "image" | "pdf".
 * Returns the public path (e.g. "/uploads/ab12.jpg") or throws on bad input.
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

  const filename = `${randomUUID()}${ext(file.name, file.type)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);
  return `/uploads/${filename}`;
}

import fs from "node:fs";
import path from "node:path";

/**
 * GET /uploads/<name> — serve uploaded files straight from UPLOAD_DIR.
 *
 * `next start` snapshots the public/ folder once at boot, so files uploaded
 * AFTER the server started (tenant photos, host flyers…) 404 until the next
 * deploy. Files already in the boot snapshot are still served statically;
 * anything newer falls through to this route, which reads the disk live.
 */

const UPLOAD_DIR =
  process.env.UPLOAD_DIR || path.join(process.cwd(), "public", "uploads");

const TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
};

export async function GET(_request, { params }) {
  const name = (params.file || []).join("/");
  const filePath = path.join(UPLOAD_DIR, name);
  // No escaping the upload dir (e.g. via ..) — filenames are flat UUIDs anyway.
  if (!filePath.startsWith(path.resolve(UPLOAD_DIR) + path.sep)) {
    return new Response("Not found", { status: 404 });
  }
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (!stat.isFile()) return new Response("Not found", { status: 404 });

  const body = fs.readFileSync(filePath); // uploads are capped at 10 MB
  return new Response(body, {
    headers: {
      "Content-Type": TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Content-Length": String(stat.size),
      // Filenames are random UUIDs — content at a URL never changes.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

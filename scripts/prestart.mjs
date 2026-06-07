/**
 * Production startup hook (Railway). Makes uploaded files persist on the
 * mounted volume by pointing public/uploads at UPLOAD_DIR.
 *
 * Behavior:
 *  - If UPLOAD_DIR is unset or already equals ./public/uploads, do nothing
 *    (local dev is unaffected).
 *  - Otherwise: ensure UPLOAD_DIR exists, copy any committed seed files from
 *    public/uploads into it (once), then replace public/uploads with a symlink
 *    to UPLOAD_DIR so Next keeps serving /uploads/* from the persistent volume.
 *
 * Safe to run on every boot — it's idempotent.
 */
import fs from "node:fs";
import path from "node:path";

const PUBLIC_UPLOADS = path.join(process.cwd(), "public", "uploads");
const target = process.env.UPLOAD_DIR;

function isSymlinkTo(p, dest) {
  try {
    return fs.lstatSync(p).isSymbolicLink() && fs.readlinkSync(p) === dest;
  } catch {
    return false;
  }
}

if (!target || path.resolve(target) === path.resolve(PUBLIC_UPLOADS)) {
  // Local/dev: nothing to do.
  process.exit(0);
}

fs.mkdirSync(target, { recursive: true });

// Already wired up? Done.
if (isSymlinkTo(PUBLIC_UPLOADS, target)) {
  console.log(`[prestart] public/uploads already linked to ${target}`);
  process.exit(0);
}

// Copy committed seed files (e.g. rental-agreement.pdf) onto the volume once.
if (fs.existsSync(PUBLIC_UPLOADS) && !fs.lstatSync(PUBLIC_UPLOADS).isSymbolicLink()) {
  for (const name of fs.readdirSync(PUBLIC_UPLOADS)) {
    const src = path.join(PUBLIC_UPLOADS, name);
    const dst = path.join(target, name);
    if (!fs.existsSync(dst) && fs.statSync(src).isFile()) {
      fs.copyFileSync(src, dst);
      console.log(`[prestart] seeded ${name} onto volume`);
    }
  }
  fs.rmSync(PUBLIC_UPLOADS, { recursive: true, force: true });
}

fs.symlinkSync(target, PUBLIC_UPLOADS);
console.log(`[prestart] linked public/uploads -> ${target}`);

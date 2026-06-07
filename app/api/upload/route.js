import { NextResponse } from "next/server";
import { saveUpload } from "@/lib/uploads.js";

/**
 * POST /api/upload  (multipart/form-data)
 *   fields: file=<File>, kind="image"|"pdf"
 * Returns { path } — the public URL to store on a record.
 *
 * Used by the host listing form (photo + PDFs). No auth: the host page is
 * gated by an unguessable token, and uploads are validated by type/size.
 */
export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const kind = formData.get("kind") === "pdf" ? "pdf" : "image";
    const path = await saveUpload(file, kind);
    if (!path) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }
    return NextResponse.json({ path });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

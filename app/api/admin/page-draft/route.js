import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getCurrentUser } from "@/lib/auth.js";
import { saveContentDraft } from "@/lib/db.js";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/page-draft  { id?, values: { [contentKey]: string } }
 * Keeps the Pages editor's unsaved edits so its preview can show them
 * (?draft=<id>). Nothing here touches the live site; Save does that.
 */
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const values = {};
  for (const [k, v] of Object.entries(body?.values || {})) {
    if (/^[a-z0-9_]{1,64}$/.test(k) && typeof v === "string" && v.length <= 50000) values[k] = v;
  }
  const id = /^[A-Za-z0-9_-]{16,64}$/.test(String(body?.id || "")) ? body.id : nanoid(24);
  saveContentDraft(id, values);
  return NextResponse.json({ id });
}

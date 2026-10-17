import { getCurrentUser } from "@/lib/auth.js";
import { accountsAnnouncementHtml } from "@/lib/email.js";

export const dynamic = "force-dynamic";

/** Shows the accounts announcement exactly as it will arrive (admins only). Sends nothing. */
export async function GET(request, { params }) {
  if (!(await getCurrentUser())) return new Response("Not found", { status: 404 });
  const audience = params.audience === "tenants" ? "tenants" : "others";
  const html = accountsAnnouncementHtml({ audience, name: audience === "tenants" ? "Juniper & Co." : "Sydney Hale" });
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Preview — ${audience}</title></head><body style="margin:0">${html}</body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  );
}

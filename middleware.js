import { NextResponse } from "next/server";
import { decodeJwt } from "jose";

/**
 * A first gate in front of /admin and /staff: no admin-session cookie (or an
 * expired / malformed one) → the login page, before any page code runs.
 *
 * The layouts' redirects aren't enough on their own — a crafted navigation
 * request can render a page without its layout — so every page also checks
 * the session itself (requireAdmin / getSignedInUser). This only DECODES the
 * token; the signature and the user's role and active flag are checked by those
 * page-level helpers against the database. Decoding (not verifying) here means
 * a secret that's missing from the edge runtime can never lock the owners out.
 */

const COOKIE = "alley_session"; // lib/auth.js COOKIE_NAME

// Pages that must work signed out: the login itself, password help, and the
// per-employee calendar feed (its token is the credential).
const OPEN = [/^\/admin\/login\/?$/, /^\/admin\/forgot\/?$/, /^\/admin\/reset\/?$/, /^\/admin\/set-password\/?$/, /^\/admin\/welcome\/?$/, /^\/staff\/calendar\//];

function looksSignedIn(token) {
  if (!token) return false;
  try {
    const { uid, exp } = decodeJwt(token);
    return Boolean(uid) && (!exp || exp * 1000 > Date.now());
  } catch {
    return false;
  }
}

// The Pages editor's live preview: a signed-in admin's request for a public page
// with ?draft=<id> shows that draft's unsaved edits (lib/db.js getContent). The
// header is always stripped from incoming requests, so nobody can set it.
function publicPage(request) {
  const headers = new Headers(request.headers);
  headers.delete("x-alley-draft");
  const draft = request.nextUrl.searchParams.get("draft");
  if (draft && /^[A-Za-z0-9_-]{16,64}$/.test(draft) && looksSignedIn(request.cookies.get(COOKIE)?.value)) {
    headers.set("x-alley-draft", draft);
  }
  return NextResponse.next({ request: { headers } });
}

export function middleware(request) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/admin") && !pathname.startsWith("/staff")) return publicPage(request);
  if (OPEN.some((re) => re.test(pathname))) return NextResponse.next();
  if (looksSignedIn(request.cookies.get(COOKIE)?.value)) return NextResponse.next();
  return NextResponse.redirect(new URL("/admin/login", request.url));
}

export const config = {
  matcher: ["/admin/:path*", "/staff/:path*", "/((?!_next/|api/|uploads/|.*\\.[a-zA-Z0-9]+$).*)"],
};

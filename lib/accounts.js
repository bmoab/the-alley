import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { customAlphabet } from "nanoid";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db.js";
import { normalizeEmail, ensureClientPortalToken } from "./portal.js";
import { ensureDirectoryToken, ensureExhibitorToken } from "./catalog.js";
import { venueToday } from "./constants.js";

/**
 * Accounts for everyone outside the team: makers, renters, event hosts,
 * tenants and exhibitors (server-only).
 *
 * One account per email address. It doesn't own anything — it shows whatever
 * already carries that address (a booking's client_email, a listing's
 * host_email, a tenant's or exhibitor's contact_email, a maker's email). So the
 * address has to be PROVEN before anything shows: a new account is unverified
 * until its owner clicks a link we emailed, and signing in by link verifies it
 * too. The private links in our emails (my-bookings, host-listing, …) keep
 * working exactly as before; the account just gathers them in one place.
 *
 * Signing up takes no password. A password chosen before the address is proven
 * would be the sign-up-first takeover: someone registers a renter's email with
 * a password of their own, the renter later clicks any link we send them, and
 * the stranger's password now opens the renter's account. So a password can
 * only be set by someone already signed in (settings) or holding a reset link.
 *
 * Its own cookie and its own table, apart from admin_users: nothing a member of
 * the public does here can be one step away from the admin.
 */

const COOKIE = "alley_account";
// A plain "signed in" flag the public header can read to say "My account"
// instead of "Log in". It proves nothing — the real session is COOKIE.
const HINT_COOKIE = "alley_in";
const SESSION_DAYS = 30;
const LINK_MINUTES = 30;
const MIN_PASSWORD = 10;
const rawToken = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789", 40);

function secretKey() {
  return new TextEncoder().encode(process.env.SESSION_SECRET || "dev-insecure-change-me");
}

const hash = (t) => createHash("sha256").update(String(t)).digest("hex");

// ---------------------------------------------------------------------------
// Throttling. In memory, per process — enough to stop someone hammering one
// address from one place; it resets on deploy, which is fine at this scale.
// ---------------------------------------------------------------------------

const hits = globalThis.__alleyAccountHits || (globalThis.__alleyAccountHits = new Map());

/**
 * The visitor's IP, for throttling. Cloudflare's header first (it overwrites
 * whatever the client sent), then the proxy's; failing those the LAST
 * X-Forwarded-For hop — the one our own proxy added. The first hop is whatever
 * the client typed, so throttling on it could be dodged at will.
 */
export function clientIp() {
  const h = headers();
  const forwarded = h.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean) || [];
  return h.get("cf-connecting-ip") || h.get("x-real-ip") || forwarded.at(-1) || "local";
}

/** True when `key` has been used `max` times in the last `minutes`; records this use otherwise. */
let calls = 0;

export function throttled(key, max, minutes) {
  const now = Date.now();
  // Now and then drop keys whose hits have all aged out, so the map can't grow forever.
  if (++calls % 500 === 0) {
    for (const [k, times] of hits) if (!times.some((t) => now - t < 60 * 60 * 1000)) hits.delete(k);
  }
  const recent = (hits.get(key) || []).filter((t) => now - t < minutes * 60 * 1000);
  if (recent.length >= max) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  return false;
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export function getAccountById(id) {
  return db.prepare("SELECT * FROM accounts WHERE id = ?").get(id) || null;
}

export function getAccountByEmail(email) {
  const clean = normalizeEmail(email);
  if (!clean) return null;
  return db.prepare("SELECT * FROM accounts WHERE email = ?").get(clean) || null;
}

function checkPassword(password) {
  if (String(password || "").length < MIN_PASSWORD) {
    throw new Error(`Pick a password at least ${MIN_PASSWORD} characters long.`);
  }
}

function checkEmail(email) {
  const clean = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error("That email address doesn't look right.");
  return clean;
}

/**
 * Sign up: name + email, no password (see the top of this file). Returns
 * { account, existing } — `existing` when the address already has an account,
 * in which case nothing changes. Either way the caller emails a sign-in link
 * and says the same thing, so the form never reveals who has an account.
 */
export function createAccount({ name, email }) {
  const clean = checkEmail(email);
  const existing = getAccountByEmail(clean);
  if (existing) return { account: existing, existing: true };
  const info = db.prepare("INSERT INTO accounts (email, name) VALUES (?, ?)").run(clean, String(name || "").trim() || null);
  return { account: getAccountById(info.lastInsertRowid), existing: false };
}

/**
 * For "email me a link": the account for this address, made on the spot if
 * there isn't one (no password — they can add one later). Proving the address
 * by clicking the link is all an account needs.
 */
export function accountForLink(email) {
  const clean = checkEmail(email);
  const existing = getAccountByEmail(clean);
  if (existing) return existing;
  const info = db.prepare("INSERT INTO accounts (email) VALUES (?)").run(clean);
  return getAccountById(info.lastInsertRowid);
}

// Compared against when there's no account or no password, so a wrong address
// takes as long to refuse as a wrong password (no timing tell for who has one).
const DUMMY_HASH = bcrypt.hashSync("no-account-here", 10);

/** Email + password. Returns { account } or { error }. */
export function checkCredentials(email, password) {
  const account = getAccountByEmail(email);
  const ok = bcrypt.compareSync(String(password || ""), account?.password_hash || DUMMY_HASH) && Boolean(account?.password_hash);
  if (!ok || !account.is_active || !account.email_verified_at) return { error: "That email and password don't match." };
  return { account };
}

export function updateAccountName(id, name) {
  db.prepare("UPDATE accounts SET name = ? WHERE id = ?").run(String(name || "").trim() || null, id);
}

/**
 * Set a password and sign out every other session (they carry the old
 * session_version). Returns the updated account, to start a fresh session with.
 */
export function setAccountPassword(id, password) {
  checkPassword(password);
  db.prepare("UPDATE accounts SET password_hash = ?, session_version = session_version + 1 WHERE id = ?").run(
    bcrypt.hashSync(String(password), 10),
    id
  );
  return getAccountById(id);
}

/** Use up every outstanding link for an account (after a reset, old links shouldn't still work). */
export function expireTokens(accountId) {
  db.prepare("UPDATE account_tokens SET used_at = datetime('now') WHERE account_id = ? AND used_at IS NULL").run(accountId);
}

// ---------------------------------------------------------------------------
// One-time links (sign-in, which also verifies the address; password reset)
// ---------------------------------------------------------------------------

/** Mint a link token. Only its hash is stored; the raw value goes in the email. */
export function issueToken(accountId, purpose) {
  const token = rawToken();
  db.prepare(
    `INSERT INTO account_tokens (account_id, purpose, token_hash, expires_at)
     VALUES (?, ?, ?, datetime('now', ?))`
  ).run(accountId, purpose, hash(token), `+${LINK_MINUTES} minutes`);
  return token;
}

/** Look a token up WITHOUT using it (so a page can show "Continue" first). */
export function peekToken(token, purpose) {
  if (!token) return null;
  return (
    db
      .prepare(
        `SELECT t.*, a.email, a.name FROM account_tokens t JOIN accounts a ON a.id = t.account_id
          WHERE t.token_hash = ? AND t.purpose = ? AND t.used_at IS NULL
            AND t.expires_at > datetime('now') AND a.is_active = 1`
      )
      .get(hash(token), purpose) || null
  );
}

/**
 * Use a token: single-use, and a sign-in link proves the address. Returns the
 * account, or null if it's unknown, used or expired. The UPDATE is the gate —
 * two clicks racing can't both win.
 */
export function consumeToken(token, purpose) {
  const row = peekToken(token, purpose);
  if (!row) return null;
  const used = db.prepare("UPDATE account_tokens SET used_at = datetime('now') WHERE id = ? AND used_at IS NULL").run(row.id);
  if (!used.changes) return null;
  // First proof of the address: drop any password set before it was proven
  // (only possible on accounts made before sign-up went passwordless).
  db.prepare(
    "UPDATE accounts SET password_hash = NULL, email_verified_at = datetime('now') WHERE id = ? AND email_verified_at IS NULL"
  ).run(row.account_id);
  return getAccountById(row.account_id);
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export async function startAccountSession(account) {
  db.prepare("UPDATE accounts SET last_login_at = datetime('now') WHERE id = ?").run(account.id);
  // `typ` keeps this token from ever being read as an admin session (which
  // looks for `uid`), and an admin token from being read as this.
  const token = await new SignJWT({ aid: account.id, typ: "account", sv: account.session_version || 0 })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());
  cookies().set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  cookies().set(HINT_COOKIE, "1", {
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export function endAccountSession() {
  cookies().set(COOKIE, "", { path: "/", maxAge: 0 });
  cookies().set(HINT_COOKIE, "", { path: "/", maxAge: 0 });
}

/** The signed-in, verified, active account — or null. */
export async function getAccount() {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload.typ !== "account" || !payload.aid) return null;
    const account = getAccountById(payload.aid);
    if (!account || !account.is_active || !account.email_verified_at) return null;
    if ((payload.sv || 0) !== (account.session_version || 0)) return null; // password changed since

    return account;
  } catch {
    return null;
  }
}

export async function requireAccount(next = "/account") {
  const account = await getAccount();
  if (!account) redirect(`/account/sign-in?next=${encodeURIComponent(next)}`);
  return account;
}

/**
 * Only ever send people back to a path on this site. Browsers read "/\x" and
 * "/<tab>/x" as "//x" (another site), so a backslash, whitespace or control
 * character anywhere — or a slash/backslash right after the first slash — fails.
 */
export function safeNext(next) {
  const n = String(next || "");
  // eslint-disable-next-line no-control-regex
  return /^\/(?![\\/])[^\s\\\x00-\x1f\x7f]*$/.test(n) ? n : "/account";
}

// ---------------------------------------------------------------------------
// What this person has with The Alley
// ---------------------------------------------------------------------------

const LIVE_BOOKING = ["pending", "held", "reserved", "confirmed"];

/**
 * Everything that carries this email, for the dashboard. Private links are
 * minted on demand (the same lazy tokens our emails use).
 */
export function whatsMine(email) {
  const clean = normalizeEmail(email);
  const today = venueToday();

  const bookings = db
    .prepare("SELECT id, date, status FROM bookings WHERE lower(trim(client_email)) = ? AND archived = 0")
    .all(clean);
  const upcoming = bookings.filter((b) => b.date >= today && LIVE_BOOKING.includes(b.status)).length;

  const listings = db
    .prepare(
      `SELECT id, title, date, status, host_token FROM events
        WHERE lower(trim(host_email)) = ? AND host_token IS NOT NULL AND status != 'removed'
        ORDER BY date DESC`
    )
    .all(clean);

  const businesses = db
    .prepare("SELECT id, business_name FROM directory WHERE lower(trim(contact_email)) = ? ORDER BY business_name")
    .all(clean)
    .map((d) => ({ ...d, token: ensureDirectoryToken(d.id) }));

  const exhibitors = db
    .prepare("SELECT id, name, status FROM exhibitors WHERE lower(trim(contact_email)) = ? ORDER BY name")
    .all(clean)
    .map((e) => ({ ...e, token: ensureExhibitorToken(e.id) }));

  const makers = db
    .prepare("SELECT id, name FROM vendors WHERE lower(trim(email)) = ? AND is_active = 1 AND kind = 'consignor' ORDER BY name")
    .all(clean);

  return {
    bookings: {
      total: bookings.length,
      upcoming,
      portalToken: bookings.length ? ensureClientPortalToken(clean) : null,
    },
    listings,
    businesses,
    exhibitors,
    makers,
  };
}

/** The maker (vendor) row this account may act as, or null. */
export function makerForAccount(account, vendorId) {
  if (!account) return null;
  return (
    db
      .prepare("SELECT * FROM vendors WHERE id = ? AND lower(trim(email)) = ? AND is_active = 1 AND kind = 'consignor'")
      .get(Number(vendorId), normalizeEmail(account.email)) || null
  );
}

// ---------------------------------------------------------------------------
// Inbox: copies of what we've emailed them (lib/email.js archiveCopy)
// ---------------------------------------------------------------------------

export function listInbox(email, { limit = 200 } = {}) {
  return db
    .prepare(
      `SELECT id, subject, attachments, mode, sent_at FROM sent_emails
        WHERE to_email = ? AND ok = 1 ORDER BY sent_at DESC, id DESC LIMIT ?`
    )
    .all(normalizeEmail(email), limit);
}

export function getInboxMessage(email, id) {
  return (
    db.prepare("SELECT * FROM sent_emails WHERE id = ? AND to_email = ? AND ok = 1").get(Number(id), normalizeEmail(email)) || null
  );
}

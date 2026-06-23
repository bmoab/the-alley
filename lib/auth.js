import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { customAlphabet } from "nanoid";
import { cookies } from "next/headers";
import { db } from "./db.js";

/**
 * Multi-user admin auth (accountability layer).
 *  - Passwords hashed with bcrypt, stored in admin_users.
 *  - Session is a JWT in an httpOnly cookie.
 *  - Two permission levels: "owner" (everything + manage users) and "user"
 *    (everything except user management).
 *  - Users are deactivated (is_active = 0), never hard-deleted, so their name
 *    survives on past activity-log entries.
 */

const COOKIE_NAME = "alley_session";
const SESSION_DAYS = 7;

// Readable temp-password alphabet (no ambiguous 0/O/1/l/I).
const tempPassword = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789", 12);
const resetToken = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789", 40);

function secretKey() {
  const secret = process.env.SESSION_SECRET || "dev-insecure-change-me";
  return new TextEncoder().encode(secret);
}

// ---------------------------------------------------------------------------
// Seeding: the two owners (Chelsea + Bayler).
// ---------------------------------------------------------------------------

const OWNERS = [
  { name: "Chelsea Funk", email: "chelseafunkhomes@gmail.com" },
  { name: "Bayler Gunnell", email: "bayler.gunnell@gmail.com" },
];
const LEGACY_EMAIL = "thealleyoncenter@gmail.com";

let seeded = false;

/**
 * Idempotently ensure the two owner accounts exist as active owners, each with
 * a one-time temp password (printed once to the server console) and a forced
 * password reset on first login. Also deactivates the legacy single-owner login
 * so exactly the two named owners remain active. Real passwords are never
 * hardcoded.
 */
export function ensureSeeded() {
  if (seeded) return;
  for (const o of OWNERS) {
    const existing = db
      .prepare("SELECT * FROM admin_users WHERE email = ?")
      .get(o.email.toLowerCase());
    if (!existing) {
      const temp = tempPassword();
      db.prepare(
        `INSERT INTO admin_users (email, password_hash, name, role, is_active, must_change_password)
         VALUES (?, ?, ?, 'owner', 1, 1)`
      ).run(o.email.toLowerCase(), bcrypt.hashSync(temp, 10), o.name);
      console.log(
        `[auth] Seeded owner ${o.name} <${o.email}> — temporary password: ${temp}\n` +
          `       (They'll be forced to set a new password on first login.)`
      );
    } else {
      // Make sure a pre-existing named-owner row is an active owner.
      db.prepare(
        "UPDATE admin_users SET role = 'owner', is_active = 1, name = COALESCE(name, ?) WHERE id = ?"
      ).run(o.name, existing.id);
    }
  }

  // Retire the legacy single-owner login (it was the only way in before). Kept
  // (not deleted) for any historical references; the owner can reactivate it
  // from the Team section if ever needed.
  const legacy = db
    .prepare("SELECT * FROM admin_users WHERE email = ?")
    .get(LEGACY_EMAIL);
  if (legacy && legacy.is_active && !OWNERS.some((o) => o.email === LEGACY_EMAIL)) {
    db.prepare("UPDATE admin_users SET is_active = 0 WHERE id = ?").run(legacy.id);
    console.log(`[auth] Deactivated legacy admin login <${LEGACY_EMAIL}> (replaced by named owners).`);
  }

  seeded = true;
}

// ---------------------------------------------------------------------------
// Credentials & sessions
// ---------------------------------------------------------------------------

/** Verify email/password against an ACTIVE account. Returns the row or null. */
export function verifyCredentials(email, password) {
  ensureSeeded();
  const user = db
    .prepare("SELECT * FROM admin_users WHERE email = ?")
    .get((email || "").toLowerCase().trim());
  if (!user || !user.is_active) return null;
  return bcrypt.compareSync(password || "", user.password_hash) ? user : null;
}

export function recordLogin(userId) {
  db.prepare("UPDATE admin_users SET last_login_at = datetime('now') WHERE id = ?").run(userId);
}

export async function createSessionToken(user) {
  return await new SignJWT({ uid: user.id, email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());
}

export async function setSessionCookie(user) {
  const token = await createSessionToken(user);
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export function clearSessionCookie() {
  cookies().set(COOKIE_NAME, "", { path: "/", maxAge: 0 });
}

/** Read & verify the current session token. Returns { uid, email } or null. */
export async function getSession() {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload;
  } catch {
    return null;
  }
}

export async function requireSession() {
  return await getSession();
}

/**
 * The full, current admin user row (with role / name / must_change_password).
 * Returns null if there's no session or the account was deactivated since the
 * session was issued.
 */
export async function getCurrentUser() {
  const session = await getSession();
  if (!session?.uid) return null;
  const user = db.prepare("SELECT * FROM admin_users WHERE id = ?").get(session.uid);
  if (!user || !user.is_active) return null;
  return user;
}

/**
 * The actor to attribute an action to in the activity log. Resolves the real
 * logged-in user; snapshots their display name so it survives deactivation.
 * Falls back to system when there's no session (shouldn't happen for
 * user-initiated actions, but never throws).
 */
export async function getActor() {
  const user = await getCurrentUser();
  if (!user) return { actorUserId: null, actorName: "system" };
  return { actorUserId: user.id, actorName: user.name || user.email };
}

// ---------------------------------------------------------------------------
// User management (owner-only at the route layer)
// ---------------------------------------------------------------------------

export function listUsers() {
  return db
    .prepare(
      `SELECT id, email, name, role, is_active, created_at, created_by, last_login_at, must_change_password
       FROM admin_users
       ORDER BY is_active DESC, (role = 'owner') DESC, name COLLATE NOCASE`
    )
    .all();
}

export function getUserById(id) {
  return db.prepare("SELECT * FROM admin_users WHERE id = ?").get(id);
}

export function getUserByEmail(email) {
  return db
    .prepare("SELECT * FROM admin_users WHERE email = ?")
    .get((email || "").toLowerCase().trim());
}

export function countActiveOwners() {
  return db
    .prepare("SELECT COUNT(*) AS n FROM admin_users WHERE role = 'owner' AND is_active = 1")
    .get().n;
}

/** True if this active owner is the only one left (the protected last owner). */
export function isLastActiveOwner(userId) {
  const u = getUserById(userId);
  if (!u || u.role !== "owner" || !u.is_active) return false;
  return countActiveOwners() <= 1;
}

/**
 * Create a new admin user. `password` is the initial password they'll use; they
 * must change it on first login. Throws on duplicate email. Returns the new id.
 */
export function createUser({ name, email, role = "user", password, createdBy = null }) {
  const normEmail = (email || "").toLowerCase().trim();
  if (!normEmail) throw new Error("Email is required.");
  if (getUserByEmail(normEmail)) throw new Error("A user with that email already exists.");
  const safeRole = role === "owner" ? "owner" : "user";
  const hash = bcrypt.hashSync(password || tempPassword(), 10);
  const info = db
    .prepare(
      `INSERT INTO admin_users (email, password_hash, name, role, is_active, created_by, must_change_password)
       VALUES (?, ?, ?, ?, 1, ?, 1)`
    )
    .run(normEmail, hash, name?.trim() || normEmail, safeRole, createdBy);
  return info.lastInsertRowid;
}

/** Deactivate (default) or reactivate a user. Guards the last active owner. */
export function setUserActive(id, active) {
  if (!active && isLastActiveOwner(id)) {
    throw new Error("You can't deactivate the last active owner. Add or promote another owner first.");
  }
  db.prepare("UPDATE admin_users SET is_active = ? WHERE id = ?").run(active ? 1 : 0, id);
  return getUserById(id);
}

/** Change a user's role. Guards demoting the last active owner. */
export function setUserRole(id, role) {
  const safeRole = role === "owner" ? "owner" : "user";
  if (safeRole === "user" && isLastActiveOwner(id)) {
    throw new Error("You can't demote the last active owner. Add or promote another owner first.");
  }
  db.prepare("UPDATE admin_users SET role = ? WHERE id = ?").run(safeRole, id);
  return getUserById(id);
}

/** Set a user's password and clear the must-change / reset flags. */
export function setPassword(id, newPassword) {
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare(
    `UPDATE admin_users
       SET password_hash = ?, must_change_password = 0, reset_token = NULL, reset_expires_at = NULL
     WHERE id = ?`
  ).run(hash, id);
  return getUserById(id);
}

/**
 * Owner resets another user's password to a fresh temp password (forces change
 * on next login). Returns the temp password so the owner can pass it along.
 */
export function resetUserPasswordToTemp(id) {
  const temp = tempPassword();
  db.prepare(
    `UPDATE admin_users
       SET password_hash = ?, must_change_password = 1, reset_token = NULL, reset_expires_at = NULL
     WHERE id = ?`
  ).run(bcrypt.hashSync(temp, 10), id);
  return temp;
}

export function generateTempPassword() {
  return tempPassword();
}

// ---------------------------------------------------------------------------
// Forgot / reset password (self-service via email link)
// ---------------------------------------------------------------------------

/**
 * Issue a reset token for an active account (valid 1 hour). Returns
 * { user, token } or null when there's no matching active account (caller stays
 * silent either way so emails don't reveal which addresses exist).
 */
export function createResetToken(email) {
  const user = getUserByEmail(email);
  if (!user || !user.is_active) return null;
  const token = resetToken();
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  db.prepare(
    "UPDATE admin_users SET reset_token = ?, reset_expires_at = ? WHERE id = ?"
  ).run(token, expires, user.id);
  return { user, token };
}

export function getUserByResetToken(token) {
  if (!token) return null;
  const user = db
    .prepare("SELECT * FROM admin_users WHERE reset_token = ?")
    .get(token);
  if (!user || !user.is_active) return null;
  if (!user.reset_expires_at || new Date(user.reset_expires_at) < new Date()) return null;
  return user;
}

export { COOKIE_NAME };

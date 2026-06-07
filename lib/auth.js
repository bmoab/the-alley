import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db } from "./db.js";

/**
 * Simple single-owner admin auth for the prototype.
 *  - Password hashed with bcrypt, stored in admin_users.
 *  - Session is a JWT in an httpOnly cookie.
 *
 * Structured so it can grow into multi-user auth later (admin_users already
 * supports multiple rows).
 */

const COOKIE_NAME = "alley_session";
const SESSION_DAYS = 7;

function secretKey() {
  const secret = process.env.SESSION_SECRET || "dev-insecure-change-me";
  return new TextEncoder().encode(secret);
}

/** Ensure an admin account exists; seed from env on first run. */
export function ensureAdminSeeded() {
  const count = db.prepare("SELECT COUNT(*) AS n FROM admin_users").get().n;
  if (count > 0) return;
  const email = (process.env.ADMIN_EMAIL || "thealleyoncenter@gmail.com").toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "alley2024";
  const hash = bcrypt.hashSync(password, 10);
  db.prepare("INSERT INTO admin_users (email, password_hash) VALUES (?, ?)").run(
    email,
    hash
  );
  console.log(`[auth] Seeded admin account: ${email}`);
}

/** Verify email/password. Returns the user row or null. */
export function verifyCredentials(email, password) {
  ensureAdminSeeded();
  const user = db
    .prepare("SELECT * FROM admin_users WHERE email = ?")
    .get((email || "").toLowerCase().trim());
  if (!user) return null;
  return bcrypt.compareSync(password || "", user.password_hash) ? user : null;
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

/** Read & verify the current session. Returns { uid, email } or null. */
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
  const session = await getSession();
  return session; // pages call this and redirect if null
}

export { COOKIE_NAME };

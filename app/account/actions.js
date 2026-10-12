"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  accountForLink,
  checkCredentials,
  consumeToken,
  createAccount,
  endAccountSession,
  expireTokens,
  getAccount,
  getAccountByEmail,
  issueToken,
  safeNext,
  setAccountPassword,
  startAccountSession,
  throttled,
  updateAccountName,
} from "@/lib/accounts.js";
import { normalizeEmail } from "@/lib/portal.js";
import { emailAccountReset, emailAccountSignIn } from "@/lib/email.js";

const APP_URL = process.env.APP_URL || "http://localhost:3000";

/**
 * The visitor's IP, for throttling. Cloudflare's header first (it overwrites
 * whatever the client sent), then the proxy's; failing those the LAST
 * X-Forwarded-For hop — the one our own proxy added. The first hop is whatever
 * the client typed, so throttling on it could be dodged at will.
 */
function clientIp() {
  const h = headers();
  const forwarded = h.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean) || [];
  return h.get("cf-connecting-ip") || h.get("x-real-ip") || forwarded.at(-1) || "local";
}

const q = (params) => new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();

async function sendSignInLink(account, next, reason) {
  const token = issueToken(account.id, "signin");
  const link = `${APP_URL}/account/link/${token}${next && next !== "/account" ? `?${q({ next })}` : ""}`;
  await emailAccountSignIn(account, link, { reason });
}

export async function signIn(formData) {
  const email = normalizeEmail(formData.get("email"));
  const next = safeNext(formData.get("next"));
  if (throttled(`pw:${email}`, 8, 15) || throttled(`pw-ip:${clientIp()}`, 30, 15)) {
    redirect(`/account/sign-in?${q({ error: "slow", next, email })}`);
  }
  const r = checkCredentials(email, formData.get("password"));
  if (r.error) redirect(`/account/sign-in?${q({ error: "bad", next, email })}`);
  await startAccountSession(r.account);
  redirect(next);
}

/** "Email me a sign-in link." Always answers the same way, account or not. */
export async function emailLink(formData) {
  const email = normalizeEmail(formData.get("email"));
  const next = safeNext(formData.get("next"));
  let account;
  try {
    account = accountForLink(email);
  } catch (err) {
    redirect(`/account/sign-in?${q({ error: "email", next, email })}`);
  }
  if (account.is_active && !throttled(`link:${email}`, 3, 60) && !throttled(`link-ip:${clientIp()}`, 15, 60)) {
    await sendSignInLink(account, next, "signin");
  }
  redirect(`/account/sign-in?${q({ sent: "1", next, email })}`);
}

/**
 * Sign up: name + email only. The answer is the same whether or not the
 * address already has an account — either way they get a link by email.
 */
export async function signUp(formData) {
  const email = normalizeEmail(formData.get("email"));
  const next = safeNext(formData.get("next"));
  const name = formData.get("name");
  if (throttled(`signup-ip:${clientIp()}`, 10, 60)) redirect(`/account/sign-up?${q({ error: "slow", next, email, name })}`);
  let result;
  try {
    result = createAccount({ name, email });
  } catch {
    redirect(`/account/sign-up?${q({ error: "email", next, email, name })}`);
  }
  if (!throttled(`link:${email}`, 3, 60)) {
    await sendSignInLink(result.account, next, result.existing ? "exists" : "new");
  }
  redirect(`/account/sign-in?${q({ notice: "verify", next, email })}`);
}

/** The "Continue" button on an emailed link (never used up by just opening it). */
export async function continueWithLink(formData) {
  const account = consumeToken(formData.get("token"), "signin");
  if (!account) redirect("/account/sign-in?error=link");
  await startAccountSession(account);
  const next = safeNext(formData.get("next"));
  // No password yet (new, or always used links): offer one, unless they were headed somewhere.
  redirect(!account.password_hash && next === "/account" ? "/account/settings?welcome=1" : next);
}

export async function requestReset(formData) {
  const email = normalizeEmail(formData.get("email"));
  const account = getAccountByEmail(email);
  if (account?.is_active && !throttled(`reset:${email}`, 3, 60) && !throttled(`reset-ip:${clientIp()}`, 15, 60)) {
    const token = issueToken(account.id, "reset");
    await emailAccountReset(account, `${APP_URL}/account/reset/${token}`);
  }
  redirect(`/account/reset?${q({ sent: "1", email })}`);
}

export async function finishReset(formData) {
  const token = formData.get("token");
  const password = String(formData.get("password") || "");
  if (password !== String(formData.get("confirm") || "")) redirect(`/account/reset/${token}?error=match`);
  if (password.length < 10) redirect(`/account/reset/${token}?error=short`);
  const account = consumeToken(token, "reset");
  if (!account) redirect("/account/sign-in?error=link");
  // New password signs out every other session; any other link still out there stops working.
  const updated = setAccountPassword(account.id, password);
  expireTokens(account.id);
  await startAccountSession(updated);
  redirect("/account?toast=" + encodeURIComponent("Password changed — you're signed in.") + "&toastType=success");
}

export async function saveSettings(formData) {
  const account = await getAccount();
  if (!account) redirect("/account/sign-in");
  updateAccountName(account.id, formData.get("name"));
  const password = String(formData.get("password") || "");
  if (password) {
    if (password !== String(formData.get("confirm") || "")) {
      redirect("/account/settings?toast=" + encodeURIComponent("Those two passwords don't match.") + "&toastType=error");
    }
    let updated;
    try {
      updated = setAccountPassword(account.id, password);
    } catch (err) {
      redirect("/account/settings?toast=" + encodeURIComponent(err.message) + "&toastType=error");
    }
    // Other devices are signed out; keep this one signed in on the new session version.
    await startAccountSession(updated);
  }
  redirect("/account/settings?toast=" + encodeURIComponent(password ? "Saved — new password set." : "Saved.") + "&toastType=success");
}

export async function signOut() {
  endAccountSession();
  redirect("/account/sign-in?out=1");
}

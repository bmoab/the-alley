import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createResetToken } from "@/lib/auth.js";
import { emailPasswordReset } from "@/lib/email.js";
import CooldownButton from "@/components/auth/CooldownButton.js";
import { throttled, clientIp } from "@/lib/accounts.js";

export const metadata = { title: "Reset password" };

const APP_URL = process.env.APP_URL || "http://localhost:3000";

async function request(formData) {
  "use server";
  const email = (formData.get("email") || "").toString().toLowerCase().trim();
  // 3 an hour per address: each one replaces the last link, so more only confuses.
  const result =
    throttled(`staff-reset:${email}`, 3, 60) || throttled(`staff-reset-ip:${clientIp()}`, 15, 60) ? null : createResetToken(email);
  if (result) {
    const link = `${APP_URL}/admin/reset?token=${result.token}`;
    try {
      await emailPasswordReset(result.user, link);
    } catch (err) {
      console.error("[forgot] reset email failed:", err.message);
    }
  }
  // Always show the same confirmation so we don't reveal which emails exist.
  redirect(`/admin/forgot?sent=1&email=${encodeURIComponent(email)}`);
}

export default function ForgotPage({ searchParams }) {
  const sent = searchParams?.sent;

  return (
    <main className="admin-ui flex min-h-screen items-center justify-center bg-paper-warm px-5 py-16">
      <div className="w-full max-w-md animate-fade-in-up">
        <div className="mb-8 flex flex-col items-center text-center">
          <Image
            src="/brand/emblem-black.png"
            alt="The Alley On Center"
            width={48}
            height={48}
            className="h-12 w-12 object-contain"
          />
          <p className="mt-3 text-xl font-semibold tracking-tight text-ink">
            The Alley <span className="text-verde-deep">On Center</span>
          </p>
        </div>

        <div className="card p-8">
          <h1 className="text-2xl font-semibold text-ink">Reset your password</h1>
          {sent ? (
            <p className="mt-3 rounded-lg border border-verde-deep/30 bg-verde/40 px-3 py-2 text-sm text-ink">
              If that email has an owner or staff login, a reset link is on its way. It works for one hour,
              and only the newest link works. Give it a few minutes and check spam.
            </p>
          ) : (
            <p className="mt-1 text-sm text-ink-muted">
              Enter your email and we&apos;ll send a link to set a new password.
            </p>
          )}
          <form action={request} className="mt-6 space-y-4">
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                required
                className="field"
                defaultValue={searchParams?.email || ""}
                placeholder="you@example.com"
              />
            </div>
            <CooldownButton storageKey="alley-staff-reset" full>
              {sent ? "Send another link" : "Send reset link"}
            </CooldownButton>
          </form>
          {sent ? (
            <p className="mt-3 text-xs text-ink-muted">
              Still nothing? Another owner can reset your password from Team.
            </p>
          ) : null}
        </div>

        <p className="mt-6 text-center text-xs text-ink-muted">
          ← <Link href="/admin/login" className="hover:text-ink">Back to sign in</Link>
        </p>
      </div>
    </main>
  );
}

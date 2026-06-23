import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createResetToken } from "@/lib/auth.js";
import { emailPasswordReset } from "@/lib/email.js";
import Button from "@/components/admin/ui/Button.js";

export const metadata = { title: "Reset password" };

const APP_URL = process.env.APP_URL || "http://localhost:3000";

async function request(formData) {
  "use server";
  const email = (formData.get("email") || "").toString();
  const result = createResetToken(email);
  if (result) {
    const link = `${APP_URL}/admin/reset?token=${result.token}`;
    try {
      await emailPasswordReset(result.user, link);
    } catch (err) {
      console.error("[forgot] reset email failed:", err.message);
    }
  }
  // Always show the same confirmation so we don't reveal which emails exist.
  redirect("/admin/forgot?sent=1");
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
            <p className="mt-3 text-sm text-ink-soft">
              If an account exists for that email, we&apos;ve sent a reset link. It expires
              in one hour. Check your inbox (and spam).
            </p>
          ) : (
            <>
              <p className="mt-1 text-sm text-ink-muted">
                Enter your email and we&apos;ll send a link to set a new password.
              </p>
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
                    placeholder="you@example.com"
                  />
                </div>
                <Button type="submit" full>Send reset link</Button>
              </form>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-ink-muted">
          ← <Link href="/admin/login" className="hover:text-ink">Back to sign in</Link>
        </p>
      </div>
    </main>
  );
}

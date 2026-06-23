import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { verifyCredentials, setSessionCookie, getCurrentUser, recordLogin, ensureSeeded } from "@/lib/auth.js";
import Button from "@/components/admin/ui/Button.js";

export const metadata = { title: "Admin Sign In" };

async function login(formData) {
  "use server";
  const email = formData.get("email");
  const password = formData.get("password");
  const user = verifyCredentials(email, password);
  if (!user) {
    redirect("/admin/login?error=1");
  }
  recordLogin(user.id);
  await setSessionCookie(user);
  // First login (or an owner-reset) forces choosing a new password.
  redirect(user.must_change_password ? "/admin/set-password" : "/admin");
}

export default async function LoginPage({ searchParams }) {
  // Ensure the two owner accounts exist (prints their one-time temp passwords to
  // the server console on first run). Idempotent.
  ensureSeeded();
  // Already signed in with an ACTIVE account? Go straight to the dashboard.
  // (Checking getCurrentUser, not just the raw cookie, so a stale session for a
  // since-deactivated account doesn't bounce /admin ⇄ /admin/login forever.)
  if (await getCurrentUser()) redirect("/admin");
  const hasError = searchParams?.error;
  const didReset = searchParams?.reset;

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
          <Link href="/" className="mt-3 text-xl font-semibold tracking-tight text-ink">
            The Alley <span className="text-verde-deep">On Center</span>
          </Link>
          <p className="mt-1 text-sm text-ink-muted">Owner administration</p>
        </div>

        <div className="card p-8">
          <h1 className="text-2xl font-semibold text-ink">Welcome back</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Sign in to manage bookings, events, and your site.
          </p>

          {hasError ? (
            <div className="mt-4 rounded-lg border border-rust/30 bg-rust/10 px-3 py-2 text-sm text-rust">
              That email and password don&apos;t match. Please try again.
            </div>
          ) : null}
          {didReset ? (
            <div className="mt-4 rounded-lg border border-verde-deep/30 bg-verde/40 px-3 py-2 text-sm text-ink">
              Your password was updated. Sign in with your new password.
            </div>
          ) : null}

          <form action={login} className="mt-6 space-y-4">
            <div>
              <label className="label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                required
                className="field"
                placeholder="you@thealleyoncenter.com"
              />
            </div>
            <div>
              <label className="label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="field"
                placeholder="••••••••"
              />
            </div>
            <Button type="submit" full>
              Sign in
            </Button>
          </form>
          <p className="mt-4 text-center text-sm">
            <Link href="/admin/forgot" className="text-verde-deep hover:underline">
              Forgot your password?
            </Link>
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-ink-muted">
          ← <Link href="/" className="hover:text-ink">Back to the website</Link>
        </p>
      </div>
    </main>
  );
}

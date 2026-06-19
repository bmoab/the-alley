import { redirect } from "next/navigation";
import Link from "next/link";
import { verifyCredentials, setSessionCookie, getSession } from "@/lib/auth.js";

export const metadata = { title: "Admin Sign In" };

async function login(formData) {
  "use server";
  const email = formData.get("email");
  const password = formData.get("password");
  const user = verifyCredentials(email, password);
  if (!user) {
    redirect("/admin/login?error=1");
  }
  await setSessionCookie(user);
  redirect("/admin");
}

export default async function LoginPage({ searchParams }) {
  // Already signed in? Go straight to the dashboard.
  if (await getSession()) redirect("/admin");
  const hasError = searchParams?.error;

  return (
    <main className="admin-ui flex min-h-screen items-center justify-center bg-ink px-5 py-16">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link
            href="/"
            className="font-display text-2xl font-semibold tracking-tight text-paper"
          >
            The Alley <span className="text-brass-light">On Center</span>
          </Link>
          <p className="mt-2 text-sm text-paper/60">Owner administration</p>
        </div>

        <div className="card p-8">
          <h1 className="font-display text-2xl font-semibold text-ink">
            Welcome back
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Sign in to manage bookings, events, and your site.
          </p>

          {hasError ? (
            <div className="mt-4 rounded-lg border border-rust/30 bg-rust/10 px-3 py-2 text-sm text-rust">
              That email and password don&apos;t match. Please try again.
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
            <button type="submit" className="btn-primary w-full">
              Sign in
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-paper/40">
          ← <Link href="/" className="hover:text-paper/70">Back to the website</Link>
        </p>
      </div>
    </main>
  );
}

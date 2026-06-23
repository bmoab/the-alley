import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getCurrentUser, setPassword, clearSessionCookie } from "@/lib/auth.js";
import Button from "@/components/admin/ui/Button.js";

export const metadata = { title: "Set your password" };

async function submit(formData) {
  "use server";
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");

  const password = (formData.get("password") || "").toString();
  const confirm = (formData.get("confirm") || "").toString();
  if (password.length < 8) {
    redirect("/admin/set-password?error=short");
  }
  if (password !== confirm) {
    redirect("/admin/set-password?error=match");
  }
  setPassword(user.id, password);
  redirect("/admin?toast=" + encodeURIComponent("Password set — you're all set.") + "&toastType=success");
}

async function signOut() {
  "use server";
  clearSessionCookie();
  redirect("/admin/login");
}

export default async function SetPasswordPage({ searchParams }) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");

  const error =
    searchParams?.error === "short"
      ? "Please choose a password of at least 8 characters."
      : searchParams?.error === "match"
        ? "Those passwords don't match. Please try again."
        : null;

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
          <h1 className="text-2xl font-semibold text-ink">
            {user.must_change_password ? "Choose your password" : "Update your password"}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {user.must_change_password
              ? `Welcome, ${user.name || user.email}. Set a password to finish setting up your account.`
              : "Pick a new password for your account."}
          </p>

          {error ? (
            <div className="mt-4 rounded-lg border border-rust/30 bg-rust/10 px-3 py-2 text-sm text-rust">
              {error}
            </div>
          ) : null}

          <form action={submit} className="mt-6 space-y-4">
            <div>
              <label className="label" htmlFor="password">New password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                className="field"
                placeholder="At least 8 characters"
              />
            </div>
            <div>
              <label className="label" htmlFor="confirm">Confirm password</label>
              <input
                id="confirm"
                name="confirm"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                className="field"
                placeholder="Re-enter your password"
              />
            </div>
            <Button type="submit" full>Save password</Button>
          </form>
        </div>

        <form action={signOut} className="mt-6 text-center">
          <button className="text-xs text-ink-muted hover:text-ink">Sign out instead</button>
        </form>
      </div>
    </main>
  );
}

import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getUserByResetToken, setPassword } from "@/lib/auth.js";
import Button from "@/components/admin/ui/Button.js";

export const metadata = { title: "Choose a new password" };

async function submit(formData) {
  "use server";
  const token = (formData.get("token") || "").toString();
  const user = getUserByResetToken(token);
  if (!user) {
    redirect("/admin/reset?error=token");
  }
  const password = (formData.get("password") || "").toString();
  const confirm = (formData.get("confirm") || "").toString();
  if (password.length < 8) {
    redirect(`/admin/reset?token=${token}&error=short`);
  }
  if (password !== confirm) {
    redirect(`/admin/reset?token=${token}&error=match`);
  }
  setPassword(user.id, password);
  redirect("/admin/login?reset=1");
}

export default function ResetPage({ searchParams }) {
  const token = searchParams?.token || "";
  const user = getUserByResetToken(token);

  const error =
    searchParams?.error === "short"
      ? "Please choose a password of at least 8 characters."
      : searchParams?.error === "match"
        ? "Those passwords don't match. Please try again."
        : searchParams?.error === "token" || !user
          ? "This reset link is invalid or has expired. Request a new one."
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
          <h1 className="text-2xl font-semibold text-ink">Choose a new password</h1>

          {error ? (
            <div className="mt-4 rounded-lg border border-rust/30 bg-rust/10 px-3 py-2 text-sm text-rust">
              {error}
            </div>
          ) : null}

          {user ? (
            <form action={submit} className="mt-6 space-y-4">
              <input type="hidden" name="token" value={token} />
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
                />
              </div>
              <Button type="submit" full>Save password</Button>
            </form>
          ) : (
            <p className="mt-4 text-sm">
              <Link href="/admin/forgot" className="text-verde-deep hover:underline">
                Request a new reset link →
              </Link>
            </p>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-ink-muted">
          ← <Link href="/admin/login" className="hover:text-ink">Back to sign in</Link>
        </p>
      </div>
    </main>
  );
}

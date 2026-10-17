import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getUserByResetToken, setPassword, recordLogin, setSessionCookie, homeFor } from "@/lib/auth.js";
import Button from "@/components/admin/ui/Button.js";
import PasswordInput from "@/components/auth/PasswordInput.js";

export const metadata = { title: "Welcome to The Alley" };

/**
 * Where a team invite lands: choose a password and you're signed straight in.
 * The invite link is the account's reset token, so it works once and expires
 * (a week for an invite, an hour for a reset an owner sent).
 */
async function accept(formData) {
  "use server";
  const token = (formData.get("token") || "").toString();
  const user = getUserByResetToken(token);
  if (!user) redirect("/admin/welcome?error=token");
  const password = (formData.get("password") || "").toString();
  if (password.length < 8) redirect(`/admin/welcome?token=${token}&error=short`);
  if (password !== (formData.get("confirm") || "").toString()) redirect(`/admin/welcome?token=${token}&error=match`);
  const updated = setPassword(user.id, password);
  recordLogin(updated.id);
  await setSessionCookie(updated);
  redirect(homeFor(updated) + "?toast=" + encodeURIComponent("Welcome aboard — you're all set.") + "&toastType=success");
}

const ERRORS = {
  short: "Choose a password of at least 8 characters.",
  match: "Those two don't match — try again.",
};

export default function WelcomePage({ searchParams }) {
  const token = searchParams?.token || "";
  const user = token ? getUserByResetToken(token) : null;
  const first = (user?.name || "").trim().split(/\s+/)[0];

  return (
    <main className="admin-ui flex min-h-screen items-center justify-center bg-paper-warm px-5 py-16">
      <div className="w-full max-w-md animate-fade-in-up">
        <div className="mb-8 flex flex-col items-center text-center">
          <Image src="/brand/emblem-black.png" alt="The Alley On Center" width={48} height={48} className="h-12 w-12 object-contain" />
          <p className="mt-3 text-xl font-semibold tracking-tight text-ink">
            The Alley <span className="text-verde-deep">On Center</span>
          </p>
        </div>

        <div className="card p-8">
          {user ? (
            <>
              <p className="eyebrow">You&apos;re invited</p>
              <h1 className="mt-1 text-2xl font-semibold text-ink">Welcome{first ? `, ${first}` : ""}</h1>
              <p className="mt-1 text-sm text-ink-muted">
                Choose a password for <strong className="text-ink">{user.email}</strong> and you&apos;re in.
              </p>
              {ERRORS[searchParams?.error] ? (
                <div className="mt-4 rounded-lg border border-rust/30 bg-rust/10 px-3 py-2 text-sm text-rust">{ERRORS[searchParams.error]}</div>
              ) : null}
              <form action={accept} className="mt-6 space-y-4">
                <input type="hidden" name="token" value={token} />
                <div>
                  <label className="label" htmlFor="password">Password</label>
                  <PasswordInput id="password" name="password" autoComplete="new-password" minLength={8} required className="field" placeholder="At least 8 characters" />
                </div>
                <div>
                  <label className="label" htmlFor="confirm">Same again</label>
                  <PasswordInput id="confirm" name="confirm" autoComplete="new-password" minLength={8} required className="field" />
                </div>
                <Button type="submit" full>Set password and sign in</Button>
              </form>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-semibold text-ink">This link has expired</h1>
              <p className="mt-2 text-sm text-ink-muted">
                Invite links work for a week and only once. Ask whoever added you to send a new one — or, if you&apos;ve
                already set a password, just sign in.
              </p>
              <Button href="/admin/login" className="mt-5">Go to sign in</Button>
            </>
          )}
        </div>
        <p className="mt-6 text-center text-xs text-ink-muted">
          ← <Link href="/" className="hover:text-ink">Back to the website</Link>
        </p>
      </div>
    </main>
  );
}

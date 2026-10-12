import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccount, safeNext } from "@/lib/accounts.js";
import { signIn, emailLink } from "../actions.js";
import Button from "@/components/admin/ui/Button.js";

export const metadata = { title: "Sign in" };

const ERRORS = {
  bad: "That email and password don't match.",
  slow: "Too many tries — wait a few minutes and try again.",
  email: "That email address doesn't look right.",
  link: "That link has expired or was already used. Send yourself a new one below.",
};

export default async function SignInPage({ searchParams }) {
  const next = safeNext(searchParams?.next);
  if (await getAccount()) redirect(next);
  const email = searchParams?.email || "";
  const error = ERRORS[searchParams?.error];

  return (
    <div className="mx-auto max-w-md space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Sign in</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Your bookings, event listings, consignment sales and every email we&apos;ve sent you — in one place.
        </p>
      </div>

      {searchParams?.sent ? (
        <p className="rounded-lg border border-verde-deep/40 bg-verde/30 px-3 py-2 text-sm text-ink">
          If {email || "that address"} can sign in here, a link is on its way. It works once, for 30 minutes — check spam if
          you don&apos;t see it.
        </p>
      ) : null}
      {searchParams?.notice === "verify" ? (
        <p className="rounded-lg border border-verde-deep/40 bg-verde/30 px-3 py-2 text-sm text-ink">
          Check your email — we sent {email || "you"} a link to confirm it&apos;s yours. Tap it and you&apos;re in.
        </p>
      ) : null}
      {searchParams?.out ? <p className="text-sm text-ink-muted">You&apos;re signed out.</p> : null}
      {error ? <p className="rounded-lg border border-rust/30 bg-rust/10 px-3 py-2 text-sm text-rust">{error}</p> : null}

      <form action={signIn} className="card space-y-3 p-6">
        <input type="hidden" name="next" value={next} />
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required defaultValue={email} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required className="field" />
        </div>
        <Button type="submit" full>Sign in</Button>
        <p className="text-right text-xs">
          <Link href="/account/reset" className="font-semibold text-ink-muted hover:text-ink">Forgot your password?</Link>
        </p>
      </form>

      <form action={emailLink} className="card space-y-3 p-6">
        <input type="hidden" name="next" value={next} />
        <p className="text-sm font-semibold text-ink">No password? We&apos;ll email you a link.</p>
        <input name="email" type="email" autoComplete="email" required defaultValue={email} placeholder="you@example.com" className="field" />
        <Button type="submit" variant="ghost" full>Email me a sign-in link</Button>
      </form>

      <p className="text-center text-sm text-ink-muted">
        New here?{" "}
        <Link href={`/account/sign-up${next !== "/account" ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-ink underline">
          Make an account
        </Link>
      </p>
      <p className="text-center text-xs text-ink-muted">
        Work at The Alley?{" "}
        <Link href="/admin/login" className="font-semibold underline hover:text-ink">
          Staff sign-in
        </Link>
      </p>
    </div>
  );
}

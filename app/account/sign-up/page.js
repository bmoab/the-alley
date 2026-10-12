import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccount, safeNext } from "@/lib/accounts.js";
import { signUp } from "../actions.js";
import Button from "@/components/admin/ui/Button.js";

export const metadata = { title: "Make an account" };

const ERRORS = {
  email: "That email address doesn't look right.",
  slow: "Too many tries — wait a few minutes and try again.",
};

export default async function SignUpPage({ searchParams }) {
  const next = safeNext(searchParams?.next);
  if (await getAccount()) redirect(next);
  const error = ERRORS[searchParams?.error];

  return (
    <div className="mx-auto max-w-md space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Make an account</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Use the email you book, sell or list with — everything under that address shows up in your account.
        </p>
      </div>
      {error ? <p className="rounded-lg border border-rust/30 bg-rust/10 px-3 py-2 text-sm text-rust">{error}</p> : null}
      <form action={signUp} className="card space-y-3 p-6">
        <input type="hidden" name="next" value={next} />
        <div>
          <label className="label" htmlFor="name">Your name</label>
          <input id="name" name="name" autoComplete="name" defaultValue={searchParams?.name || ""} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required defaultValue={searchParams?.email || ""} className="field" />
        </div>
        <Button type="submit" full>Make my account</Button>
        <p className="text-xs text-ink-muted">
          We&apos;ll email you a link to confirm the address is yours. Once you&apos;re in, you can add a password — or keep
          signing in by email link.
        </p>
      </form>
      <p className="text-center text-sm text-ink-muted">
        Already have one?{" "}
        <Link href="/account/sign-in" className="font-semibold text-ink underline">Sign in</Link>
      </p>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccount, safeNext } from "@/lib/accounts.js";
import { signUp } from "@/app/account/actions.js";
import { Note, Submit } from "@/components/account/AuthBits.js";

export const metadata = { title: "Create your account" };

const ERRORS = {
  email: "That email address doesn't look right.",
  slow: "Too many tries — wait a few minutes and try again.",
};

export default async function SignUpPage({ searchParams }) {
  const next = safeNext(searchParams?.next);
  if (await getAccount()) redirect(next);
  const error = ERRORS[searchParams?.error];

  return (
    <>
      <header className="ac-form-head">
        <p className="ac-eyebrow ac-rise">Join The Alley</p>
        <h1 className="ac-title ac-rise ac-rise-1">Create your account</h1>
        <p className="ac-lede ac-rise ac-rise-2">
          Use the email you book, sell or list with — everything under that address gathers here.
        </p>
      </header>
      {error ? (
        <div style={{ marginBottom: 26 }}>
          <Note tone="error">{error}</Note>
        </div>
      ) : null}
      <form action={signUp} className="ac-rise ac-rise-3">
        <input type="hidden" name="next" value={next} />
        <div className="ac-field">
          <label className="ac-label" htmlFor="name">Your name</label>
          <input id="name" name="name" autoComplete="name" defaultValue={searchParams?.name || ""} placeholder="First and last" className="ac-input" />
        </div>
        <div className="ac-field">
          <label className="ac-label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required defaultValue={searchParams?.email || ""} placeholder="you@example.com" className="ac-input" />
        </div>
        <div style={{ marginTop: 26 }}>
          <Submit pendingLabel="Creating…">Create account</Submit>
        </div>
        <p className="ac-hint" style={{ marginTop: 16 }}>
          We&apos;ll email you a link to confirm the address is yours. Once you&apos;re in you can add a password — or keep
          signing in by email link.
        </p>
      </form>
      <div className="ac-form-foot ac-rise ac-rise-4">
        <p>Already have an account?</p>
        <Link href="/account/sign-in" className="ac-rulelink">Sign in</Link>
      </div>
    </>
  );
}

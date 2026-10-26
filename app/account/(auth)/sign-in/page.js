import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccount, safeNext } from "@/lib/accounts.js";
import { getSignedInUser, homeFor } from "@/lib/auth.js";
import { signIn, emailLink } from "@/app/account/actions.js";
import { SignInForm, Note } from "@/components/account/AuthBits.js";

export const metadata = { title: "Sign in" };

const ERRORS = {
  bad: "That email and password don't match. Owners and staff can use their staff login here too — or reset your password.",
  slow: "Too many tries — wait a few minutes and try again.",
  email: "That email address doesn't look right.",
  link: "That link has expired or was already used. Send yourself a new one below.",
};

export default async function SignInPage({ searchParams }) {
  const next = safeNext(searchParams?.next);
  if (await getAccount()) redirect(next);
  // Already signed in on the team side (the owner's email works here too):
  // the header's "Log in" goes straight back, instead of asking again.
  if (next === "/account" && !searchParams?.error) {
    const staff = await getSignedInUser();
    if (staff) redirect(staff.must_change_password ? "/admin/set-password" : homeFor(staff));
  }
  const email = searchParams?.email || "";
  const error = ERRORS[searchParams?.error];
  // Came back from sending a link (or a dead link)? Open on the link tab.
  const mode = searchParams?.sent || searchParams?.error === "link" ? "link" : "password";
  const nextQs = next !== "/account" ? `?next=${encodeURIComponent(next)}` : "";

  return (
    <>
      <header className="ac-form-head">
        <p className="ac-eyebrow ac-rise">Welcome back</p>
        <h1 className="ac-title ac-rise ac-rise-1">Sign in</h1>
        <p className="ac-lede ac-rise ac-rise-2">Your bookings, listings, sales and every email from us.</p>
      </header>

      <div className="ac-rise ac-rise-3" style={{ display: "grid", gap: 12, marginBottom: error || searchParams?.sent || searchParams?.notice || searchParams?.out ? 26 : 0 }}>
        {searchParams?.sent ? (
          <Note>
            If {email || "that address"} can sign in here, a link is on its way. It works once, for 30 minutes — check spam if
            it&apos;s not there in a minute.
          </Note>
        ) : null}
        {searchParams?.notice === "verify" ? (
          <Note>
            Check your email — we sent {email || "you"} a link to confirm it&apos;s yours. Tap it and you&apos;re in.
          </Note>
        ) : null}
        {searchParams?.out ? <Note>You&apos;re signed out. See you soon.</Note> : null}
        {error ? <Note tone="error">{error}</Note> : null}
      </div>

      <div className="ac-rise ac-rise-4">
        <SignInForm signIn={signIn} emailLink={emailLink} next={next} email={email} mode={mode} forgotHref="/account/reset" />
      </div>

      <div className="ac-form-foot ac-rise ac-rise-5">
        <p>New to The Alley?</p>
        <Link href={`/account/sign-up${nextQs}`} className="ac-rulelink">Create your account</Link>
      </div>
    </>
  );
}

import Link from "next/link";
import { peekToken, safeNext } from "@/lib/accounts.js";
import { continueWithLink } from "@/app/account/actions.js";
import { Submit } from "@/components/account/AuthBits.js";

export const metadata = { title: "Sign in" };

/**
 * An emailed sign-in link. Opening it does nothing by itself — email scanners
 * open links to check them, and would burn a single-use token — so the person
 * taps Continue.
 */
export default function LinkPage({ params, searchParams }) {
  const row = peekToken(params.token, "signin");
  if (!row) {
    return (
      <>
        <header className="ac-form-head">
          <p className="ac-eyebrow ac-rise">Sign-in link</p>
          <h1 className="ac-title ac-rise ac-rise-1">That link has expired</h1>
          <p className="ac-lede ac-rise ac-rise-2">Sign-in links work once, for 30 minutes.</p>
        </header>
        <a href="/account/sign-in?error=link" className="ac-btn ac-rise ac-rise-3">
          Get a new one <span className="ac-arrow" aria-hidden="true">→</span>
        </a>
      </>
    );
  }
  return (
    <>
      <header className="ac-form-head">
        <p className="ac-eyebrow ac-rise">Almost there</p>
        <h1 className="ac-title ac-rise ac-rise-1">Welcome in</h1>
        <p className="ac-lede ac-rise ac-rise-2">
          Signing in as <strong style={{ fontWeight: 600, color: "var(--ink)" }}>{row.email}</strong>.
        </p>
      </header>
      <form action={continueWithLink} className="ac-rise ac-rise-3">
        <input type="hidden" name="token" value={params.token} />
        <input type="hidden" name="next" value={safeNext(searchParams?.next)} />
        <Submit pendingLabel="Signing in…">Continue</Submit>
      </form>
      <div className="ac-form-foot ac-rise ac-rise-4">
        <p>Not you?</p>
        <Link href="/account/sign-in" className="ac-rulelink">Use a different email</Link>
      </div>
    </>
  );
}

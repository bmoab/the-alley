import Link from "next/link";
import { requestReset } from "@/app/account/actions.js";
import { Note } from "@/components/account/AuthBits.js";
import CooldownButton from "@/components/auth/CooldownButton.js";

export const metadata = { title: "Reset your password" };

export default function ResetPage({ searchParams }) {
  const sent = searchParams?.sent;
  return (
    <>
      <header className="ac-form-head">
        <p className="ac-eyebrow ac-rise">Forgot your password?</p>
        <h1 className="ac-title ac-rise ac-rise-1">Reset it</h1>
        <p className="ac-lede ac-rise ac-rise-2">Enter your email and we&apos;ll send a link to choose a new one.</p>
      </header>
      {sent ? (
        <div style={{ marginBottom: 26 }}>
          <Note>
            If {searchParams.email || "that address"} has an account or a staff login, a reset link is on its way. Give it a few
            minutes and check spam — only the newest link works.
          </Note>
        </div>
      ) : null}
      <form action={requestReset} className="ac-rise ac-rise-3">
        <div className="ac-field">
          <label className="ac-label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required autoComplete="email" defaultValue={searchParams?.email || ""} placeholder="you@example.com" className="ac-input" />
        </div>
        <div style={{ marginTop: 26 }}>
          <CooldownButton storageKey="alley-account-reset" unstyled className="ac-btn">
            {sent ? "Send another link" : "Send reset link"}
          </CooldownButton>
        </div>
      </form>
      <div className="ac-form-foot ac-rise ac-rise-4">
        {sent ? (
          <p>
            Nothing coming? You may not have an account yet — <Link href="/account/sign-up" className="ac-link ac-link--quiet">create one</Link>.
          </p>
        ) : (
          <p>Remembered it?</p>
        )}
        <Link href="/account/sign-in" className="ac-rulelink">Back to sign in</Link>
      </div>
    </>
  );
}

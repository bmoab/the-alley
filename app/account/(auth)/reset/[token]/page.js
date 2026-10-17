import { peekToken } from "@/lib/accounts.js";
import { finishReset } from "@/app/account/actions.js";
import { Note, Submit } from "@/components/account/AuthBits.js";
import PasswordInput from "@/components/auth/PasswordInput.js";

export const metadata = { title: "Choose a new password" };

const ERRORS = {
  match: "Those two passwords don't match.",
  short: "Pick a password at least 10 characters long.",
};

export default function NewPasswordPage({ params, searchParams }) {
  const row = peekToken(params.token, "reset");
  if (!row) {
    return (
      <>
        <header className="ac-form-head">
          <p className="ac-eyebrow ac-rise">Reset link</p>
          <h1 className="ac-title ac-rise ac-rise-1">That link has expired</h1>
          <p className="ac-lede ac-rise ac-rise-2">Reset links work for an hour, and only the newest one.</p>
        </header>
        <a href="/account/reset" className="ac-btn ac-rise ac-rise-3">
          Send a new one <span className="ac-arrow" aria-hidden="true">→</span>
        </a>
      </>
    );
  }
  return (
    <>
      <header className="ac-form-head">
        <p className="ac-eyebrow ac-rise">{row.email}</p>
        <h1 className="ac-title ac-rise ac-rise-1">Choose a new password</h1>
        <p className="ac-lede ac-rise ac-rise-2">At least 10 characters. A short sentence is easy to remember and hard to guess.</p>
      </header>
      {ERRORS[searchParams?.error] ? (
        <div style={{ marginBottom: 26 }}>
          <Note tone="error">{ERRORS[searchParams.error]}</Note>
        </div>
      ) : null}
      <form action={finishReset} className="ac-rise ac-rise-3">
        <input type="hidden" name="token" value={params.token} />
        <div className="ac-field">
          <label className="ac-label" htmlFor="password">New password</label>
          <PasswordInput id="password" name="password" autoComplete="new-password" minLength={10} required className="ac-input" />
        </div>
        <div className="ac-field">
          <label className="ac-label" htmlFor="confirm">Same again</label>
          <PasswordInput id="confirm" name="confirm" autoComplete="new-password" minLength={10} required className="ac-input" />
        </div>
        <div style={{ marginTop: 26 }}>
          <Submit pendingLabel="Saving…">Save and sign in</Submit>
        </div>
      </form>
    </>
  );
}

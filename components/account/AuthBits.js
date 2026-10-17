"use client";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { CircleAlert, MailCheck } from "lucide-react";
import PasswordInput from "@/components/auth/PasswordInput.js";
import CooldownButton from "@/components/auth/CooldownButton.js";

/** The account pages' submit button: shows it's working, and an arrow that leans in on hover. */
export function Submit({ children, pendingLabel = "One moment…", variant, className = "" }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`ac-btn ${variant === "ghost" ? "ac-btn--ghost" : ""} ${className}`}>
      {pending ? pendingLabel : children}
      {pending ? null : <span className="ac-arrow" aria-hidden="true">→</span>}
    </button>
  );
}

/** A quiet note above a form: what just happened, or what went wrong. */
export function Note({ tone = "info", children }) {
  const Icon = tone === "error" ? CircleAlert : MailCheck;
  return (
    <div className={`ac-note ${tone === "error" ? "ac-note--error" : ""}`} role={tone === "error" ? "alert" : "status"}>
      <Icon width={18} height={18} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

/**
 * Sign in, one form, two ways: a password, or a link by email. The email box is
 * shared, so switching never loses what you typed; the choice just swaps the
 * button and folds the password away.
 */
export function SignInForm({ signIn, emailLink, next, email = "", mode: initial = "password", forgotHref }) {
  const [mode, setMode] = useState(initial);
  const isPw = mode === "password";
  return (
    <form action={isPw ? signIn : emailLink}>
      <input type="hidden" name="next" value={next} />
      <div className="ac-seg" role="group" aria-label="How to sign in">
        <button type="button" aria-pressed={isPw} onClick={() => setMode("password")}>
          Password
        </button>
        <button type="button" aria-pressed={!isPw} onClick={() => setMode("link")}>
          Email me a link
        </button>
      </div>

      <div className="ac-field">
        <label className="ac-label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required defaultValue={email} placeholder="you@example.com" className="ac-input" />
      </div>

      <div className="ac-collapse" data-open={isPw} aria-hidden={!isPw}>
        <div>
          <div className="ac-field" style={{ marginTop: 18 }}>
            <div className="ac-field-row">
              <label className="ac-label" htmlFor="password">Password</label>
              <a href={forgotHref} className="ac-link--quiet ac-link" tabIndex={isPw ? 0 : -1}>
                Forgot it?
              </a>
            </div>
            {/* Only required (and only sent) in password mode. */}
            <PasswordInput
              id="password"
              name={isPw ? "password" : undefined}
              autoComplete="current-password"
              required={isPw}
              disabled={!isPw}
              placeholder="Your password"
              className="ac-input"
            />
          </div>
        </div>
      </div>

      {!isPw ? (
        <p className="ac-hint" style={{ marginTop: 14 }}>
          We&apos;ll email you a link that signs you straight in. No password needed.
        </p>
      ) : null}

      <div style={{ marginTop: 26 }}>
        {isPw ? (
          <Submit pendingLabel="Signing in…">Sign in</Submit>
        ) : (
          <CooldownButton storageKey="alley-signin-link" unstyled className="ac-btn">
            Send my link
          </CooldownButton>
        )}
      </div>
    </form>
  );
}

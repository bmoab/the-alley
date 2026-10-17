import { requireAccount } from "@/lib/accounts.js";
import { saveSettings, signOut } from "@/app/account/actions.js";
import { Note, Submit } from "@/components/account/AuthBits.js";
import PasswordInput from "@/components/auth/PasswordInput.js";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }) {
  const account = await requireAccount("/account/settings");
  return (
    <>
      <header className="ac-hello">
        <p className="ac-eyebrow ac-date ac-rise">Settings</p>
        <h1 className="ac-title ac-rise ac-rise-1">Your details</h1>
      </header>

      {searchParams?.welcome && !account.password_hash ? (
        <div className="ac-rise ac-rise-2" style={{ marginBottom: 32 }}>
          <Note>
            You&apos;re in. Want a password for next time? Add one below — or skip it and{" "}
            <a href="/account" style={{ fontWeight: 600, textDecoration: "underline" }}>go to your account</a>; we&apos;ll email
            you a link whenever you sign in.
          </Note>
        </div>
      ) : null}

      <form action={saveSettings} className="ac-rise ac-rise-2">
        <section className="ac-set">
          <div>
            <h2 className="ac-h2">Profile</h2>
            <p className="ac-small" style={{ marginTop: 6 }}>How we greet you.</p>
          </div>
          <div className="ac-set-card">
            <div className="ac-field">
              <label className="ac-label" htmlFor="name">Your name</label>
              <input id="name" name="name" defaultValue={account.name || ""} className="ac-input" />
            </div>
            <div className="ac-field">
              <label className="ac-label" htmlFor="email-shown">Email</label>
              <input id="email-shown" value={account.email} readOnly className="ac-input" />
              <p className="ac-hint">Everything in your account is matched by this address. To change it, ask us.</p>
            </div>
          </div>
        </section>

        <section className="ac-set">
          <div>
            <h2 className="ac-h2">{account.password_hash ? "Password" : "Add a password"}</h2>
            <p className="ac-small" style={{ marginTop: 6 }}>
              {account.password_hash
                ? "Leave these blank to keep the one you have."
                : "Optional — or keep signing in with a link by email."}
            </p>
          </div>
          <div className="ac-set-card">
            <div className="ac-two">
              <div className="ac-field">
                <label className="ac-label" htmlFor="password">{account.password_hash ? "New password" : "Password"}</label>
                <PasswordInput id="password" name="password" autoComplete="new-password" minLength={10} placeholder="10 or more characters" className="ac-input" />
              </div>
              <div className="ac-field">
                <label className="ac-label" htmlFor="confirm">Same again</label>
                <PasswordInput id="confirm" name="confirm" autoComplete="new-password" minLength={10} className="ac-input" />
              </div>
            </div>
          </div>
        </section>

        <div className="ac-set" style={{ borderTop: 0, paddingTop: 0 }}>
          <div />
          <div>
            <Submit pendingLabel="Saving…" className="ac-btn--auto">Save changes</Submit>
          </div>
        </div>
      </form>

      <section className="ac-set">
        <div>
          <h2 className="ac-h2">Sign out</h2>
          <p className="ac-small" style={{ marginTop: 6 }}>On this device.</p>
        </div>
        <form action={signOut}>
          <Submit variant="ghost" pendingLabel="Signing out…" className="ac-btn--auto">Sign out</Submit>
        </form>
      </section>
    </>
  );
}

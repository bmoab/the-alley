import { ChevronRight } from "lucide-react";
import { tourHref } from "@/lib/account-tour.js";
import { emailShell } from "@/lib/email.js";
import { venueDayOf, formatDate } from "@/lib/constants.js";
import { Submit } from "@/components/account/AuthBits.js";
import PasswordInput from "@/components/auth/PasswordInput.js";
import { tourNoop } from "../actions.js";

/**
 * The account's own pages for the tour — Inbox, one email, Settings — with
 * the same markup as app/account/(app)/inbox and settings, and sample mail.
 */

export function TourInbox({ m }) {
  return (
    <>
      <header className="ac-hello">
        <p className="ac-eyebrow ac-date ac-rise">Inbox</p>
        <h1 className="ac-title ac-rise ac-rise-1">Everything we&apos;ve sent you</h1>
        <p className="ac-lede ac-rise ac-rise-2">
          Invoices, receipts, payouts and updates to {m.account.email} — kept here, so there&apos;s nothing to dig for.
        </p>
      </header>
      {m.inbox.length ? (
        <ul className="ac-mail ac-rows ac-rise ac-rise-3">
          {m.inbox.map((e) => (
            <li key={e.id}>
              <a href={tourHref(m.key, "email", e.id)}>
                <span className="ac-mail-mark" aria-hidden="true">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/brand/emblem-black.png" alt="" />
                </span>
                <span className="ac-row-main">
                  <span className="ac-row-title">{e.subject}</span>
                  <span className="ac-row-sub">The Alley On Center</span>
                </span>
                <span className="ac-mail-date">{formatDate(venueDayOf(e.sent_at))}</span>
                <ChevronRight className="ac-row-chev" width={18} height={18} aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <div className="ac-set-card ac-rise ac-rise-3">
          <p className="ac-tile-body">Nothing yet. From now on, every email we send you is kept here too.</p>
        </div>
      )}
    </>
  );
}

export function TourEmail({ m, id }) {
  const e = m.inbox.find((x) => String(x.id) === String(id)) || m.inbox[0];
  if (!e) return <TourInbox m={m} />;
  return (
    <>
      <a href={tourHref(m.key, "inbox")} className="ac-rulelink ac-rise">Inbox</a>
      <h1 className="ac-title ac-rise ac-rise-1" style={{ fontSize: "clamp(26px,3.4vw,38px)", marginTop: 22 }}>{e.subject}</h1>
      <article className="ac-letter ac-rise ac-rise-2" style={{ marginTop: 26 }}>
        <div className="ac-letter-head">
          <span className="ac-mail-mark" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/emblem-black.png" alt="" />
          </span>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 600 }}>The Alley On Center</p>
            <p className="ac-small" style={{ margin: 0 }}>
              Sent {formatDate(venueDayOf(e.sent_at))} to {m.account.email}
            </p>
          </div>
        </div>
        <iframe title={e.subject} srcDoc={emailShell(e.body || "")} sandbox="" />
      </article>
    </>
  );
}

export function TourSettings({ m }) {
  return (
    <>
      <header className="ac-hello">
        <p className="ac-eyebrow ac-date ac-rise">Settings</p>
        <h1 className="ac-title ac-rise ac-rise-1">Your details</h1>
      </header>

      <form action={tourNoop} className="ac-rise ac-rise-2">
        <section className="ac-set">
          <div>
            <h2 className="ac-h2">Profile</h2>
            <p className="ac-small" style={{ marginTop: 6 }}>How we greet you.</p>
          </div>
          <div className="ac-set-card">
            <div className="ac-field">
              <label className="ac-label" htmlFor="name">Your name</label>
              <input id="name" name="name" defaultValue={m.account.name} className="ac-input" />
            </div>
            <div className="ac-field">
              <label className="ac-label" htmlFor="email-shown">Email</label>
              <input id="email-shown" value={m.account.email} readOnly className="ac-input" />
              <p className="ac-hint">Everything in your account is matched by this address. To change it, ask us.</p>
            </div>
          </div>
        </section>

        <section className="ac-set">
          <div>
            <h2 className="ac-h2">Password</h2>
            <p className="ac-small" style={{ marginTop: 6 }}>Leave these blank to keep the one you have.</p>
          </div>
          <div className="ac-set-card">
            <div className="ac-two">
              <div className="ac-field">
                <label className="ac-label" htmlFor="password">New password</label>
                <PasswordInput id="password" name="password" autoComplete="off" placeholder="10 or more characters" className="ac-input" />
              </div>
              <div className="ac-field">
                <label className="ac-label" htmlFor="confirm">Same again</label>
                <PasswordInput id="confirm" name="confirm" autoComplete="off" className="ac-input" />
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
        <form action={tourNoop}>
          <Submit variant="ghost" pendingLabel="Signing out…" className="ac-btn--auto">Sign out</Submit>
        </form>
      </section>
    </>
  );
}

import Link from "next/link";

/**
 * The sign-in pages: the building's facade on a verde panel beside the form
 * (above it on a phone), so arriving here feels like walking up to the door.
 */
export default function AuthLayout({ children }) {
  return (
    <div className="ac-auth">
      <aside className="ac-panel">
        <div className="ac-panel-top">
          <Link href="/" className="ac-panel-logo" aria-label="The Alley On Center — home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-horizontal-black.png" alt="The Alley On Center" />
          </Link>
          <Link href="/" className="ac-panel-back">← Back to the site</Link>
        </div>
        <div className="ac-panel-copy ac-rise ac-rise-2">
          <p className="ac-eyebrow">Your Alley account</p>
          <p className="ac-panel-quote">Everything you do with The Alley, in one place.</p>
          <ul className="ac-panel-list">
            <li>Room bookings and what&apos;s paid</li>
            <li>Your event listings</li>
            <li>Consignment sales and payouts</li>
            <li>Every email we&apos;ve sent you</li>
          </ul>
        </div>
        <div className="ac-panel-art" aria-hidden="true" />
      </aside>
      <main className="ac-form-side">
        <div className="ac-form-wrap">{children}</div>
        <p className="ac-legal">
          Work at The Alley? <Link href="/admin/login">Staff sign-in</Link>
        </p>
      </main>
    </div>
  );
}

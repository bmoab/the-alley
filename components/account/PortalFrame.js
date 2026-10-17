import Link from "next/link";
import { Suspense } from "react";
import "@/app/account/account.css";
import { getAccount } from "@/lib/accounts.js";
import Toaster from "@/components/admin/ui/Toaster.js";

function initials(account) {
  const src = (account.name || account.email || "?").trim();
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (account.name ? parts[1]?.[0] || "" : "")).toUpperCase() || "?";
}

/**
 * The frame around every private-link page (my bookings, event listing,
 * business, exhibitor, consignment): the account area's header and look, so a
 * host arriving from an email lands somewhere that feels like the same place
 * as their account. Signed in, the corner leads back to the account; signed
 * out, it offers to sign in.
 */
export default async function PortalFrame({ label, children, toaster = false, className = "" }) {
  const account = await getAccount();
  return (
    <div className={`ac brandpage ac-portal ${className}`}>
      <header className="ac-top">
        <div className="ac-top-in">
          <Link href="/" className="ac-top-logo" aria-label="The Alley On Center — home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-horizontal-black.png" alt="The Alley On Center" />
          </Link>
          {label ? <span className="ac-top-label" style={{ marginInline: "auto" }}>{label}</span> : <span style={{ marginInline: "auto" }} />}
          {account ? (
            <Link href="/account" className="ac-me" title="Your account">
              <span className="ac-me-email">Your account</span>
              <span className="ac-avatar" aria-hidden="true">{initials(account)}</span>
            </Link>
          ) : (
            <Link href="/account/sign-in" className="ac-link">Sign in</Link>
          )}
        </div>
      </header>
      <main className="ac-main ac-main--narrow">{children}</main>
      {toaster ? (
        <Suspense fallback={null}>
          <Toaster />
        </Suspense>
      ) : null}
    </div>
  );
}

/** The page's opening: a small line above, the title, and a sentence or two. */
export function PortalHead({ eyebrow, title, children }) {
  return (
    <header className="ac-hello" style={{ marginBottom: 28 }}>
      {eyebrow ? <p className="ac-eyebrow ac-date ac-rise">{eyebrow}</p> : null}
      <h1 className="ac-title ac-rise ac-rise-1">{title}</h1>
      {children ? <div className="ac-lede ac-rise ac-rise-2">{children}</div> : null}
    </header>
  );
}

/** A private link that doesn't (or no longer) works. */
export function PortalMissing({ title = "Link not found", children }) {
  return (
    <div className="ac-missing">
      <p className="ac-eyebrow">Private link</p>
      <h1 className="ac-title">{title}</h1>
      <p className="ac-lede">{children}</p>
      <Link href="/account/sign-in" className="ac-btn ac-btn--auto">
        Sign in to your account <span className="ac-arrow" aria-hidden="true">→</span>
      </Link>
    </div>
  );
}

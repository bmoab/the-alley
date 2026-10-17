import Link from "next/link";
import { getAccount } from "@/lib/accounts.js";
import AccountNav, { AccountMobileNav } from "@/components/account/AccountNav.js";

function initials(account) {
  const src = (account.name || account.email || "?").trim();
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (account.name ? parts[1]?.[0] || "" : "")).toUpperCase() || "?";
}

/** The signed-in frame: a light header with the tabs, and room to breathe below. */
export default async function AccountAppLayout({ children }) {
  const account = await getAccount();
  return (
    <>
      <header className="ac-top">
        <div className="ac-top-in">
          <Link href="/" className="ac-top-logo" aria-label="The Alley On Center — home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-horizontal-black.png" alt="The Alley On Center" />
          </Link>
          {account ? <AccountNav /> : null}
          {account ? (
            <Link href="/account/settings" className="ac-me" title="Settings">
              <span className="ac-me-email">{account.email}</span>
              <span className="ac-avatar" aria-hidden="true">{initials(account)}</span>
            </Link>
          ) : null}
        </div>
      </header>
      <main className="ac-main">{children}</main>
      {account ? <AccountMobileNav /> : null}
    </>
  );
}

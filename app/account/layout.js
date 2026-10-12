import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { getAccount } from "@/lib/accounts.js";
import AccountNav from "@/components/account/AccountNav.js";
import Toaster from "@/components/admin/ui/Toaster.js";

export const metadata = { title: { default: "Your account", template: "%s · The Alley On Center" } };
export const dynamic = "force-dynamic";

/**
 * Accounts for makers, renters, event hosts, tenants and exhibitors. The tabs
 * only show once someone's signed in; the sign-in pages share the header.
 */
export default async function AccountLayout({ children }) {
  const account = await getAccount();
  return (
    <div className="admin-ui min-h-screen bg-paper-warm">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2.5 px-4 py-3">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/brand/emblem-black.png" alt="The Alley" width={28} height={28} className="h-7 w-7 object-contain" />
            <span className="text-sm font-semibold text-ink">
              The Alley <span className="text-verde-deep">On Center</span>
            </span>
          </Link>
          {account ? <span className="ml-auto truncate text-xs text-ink-muted">{account.email}</span> : null}
        </div>
        {account ? <AccountNav /> : null}
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6 pb-16">{children}</main>
      <Suspense fallback={null}>
        {/* The account pages show ?error= codes in their own words, never the raw value. */}
        <Toaster ignore={["error"]} />
      </Suspense>
    </div>
  );
}

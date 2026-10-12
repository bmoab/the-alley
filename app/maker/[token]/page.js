import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { getVendorByToken } from "@/lib/inventory.js";
import MakerHome from "@/components/maker/MakerHome.js";
import Toaster from "@/components/admin/ui/Toaster.js";

export const metadata = { title: "Your consignment · The Alley On Center", robots: { index: false } };
// Per-token page: never cache one maker's view and serve it to another.
export const dynamic = "force-dynamic";

/** A maker's private link — the same page their account shows, no sign-in needed. */
export default function MakerLinkPage({ params }) {
  const vendor = getVendorByToken(params.token);
  return (
    <div className="admin-ui min-h-screen bg-paper-warm">
      <header className="border-b border-line bg-paper/95">
        <div className="mx-auto flex max-w-3xl items-center gap-2.5 px-4 py-3">
          <Image src="/brand/emblem-black.png" alt="The Alley" width={28} height={28} className="h-7 w-7 object-contain" />
          <span className="text-sm font-semibold text-ink">
            The Alley <span className="text-verde-deep">On Center</span>
          </span>
          <Link href="/account/sign-in" className="ml-auto text-xs font-semibold text-ink-muted hover:text-ink">
            Sign in
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6 pb-16">
        {vendor ? (
          <>
            {vendor.email ? (
              <p className="mb-5 rounded-xl border border-line bg-paper-dim px-4 py-3 text-sm text-ink-soft">
                Prefer a password?{" "}
                <Link href="/account/sign-up" className="font-semibold text-ink underline">
                  Make an account
                </Link>{" "}
                with {vendor.email} — it shows this, plus a copy of every email we send you, in one place.
              </p>
            ) : null}
            <MakerHome vendorId={vendor.id} hidden={{ token: params.token }} />
          </>
        ) : (
          <div className="card p-8 text-center">
            <h1 className="text-xl font-semibold text-ink">Link not found</h1>
            <p className="mt-2 text-sm text-ink-muted">This link isn&apos;t active any more. Ask us for a new one, or sign in.</p>
          </div>
        )}
      </main>
      <Suspense fallback={null}>
        <Toaster />
      </Suspense>
    </div>
  );
}

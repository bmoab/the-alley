import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { getSession, clearSessionCookie } from "@/lib/auth.js";
import AdminNav from "@/components/admin/AdminNav.js";
import BottomNav from "@/components/admin/BottomNav.js";
import Toaster from "@/components/admin/ui/Toaster.js";

async function logout() {
  "use server";
  clearSessionCookie();
  redirect("/admin/login");
}

export default async function AdminLayout({ children }) {
  const session = await getSession();
  if (!session) redirect("/admin/login");

  return (
    <div className="admin-ui min-h-screen bg-paper-warm lg:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-line bg-paper lg:block">
        <AdminNav email={session.email} logout={logout} />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center gap-2.5 border-b border-line bg-paper/95 px-4 py-3 backdrop-blur lg:hidden">
        <Link href="/admin" className="flex items-center gap-2.5">
          <Image
            src="/brand/emblem-black.png"
            alt="The Alley"
            width={28}
            height={28}
            className="h-7 w-7 object-contain"
          />
          <span className="text-sm font-semibold text-ink">
            The Alley <span className="text-verde-deep">Admin</span>
          </span>
        </Link>
      </header>

      {/* Main content */}
      <main className="flex-1">
        <div className="mx-auto max-w-5xl px-5 py-7 pb-24 sm:px-8 lg:py-9 lg:pb-9">
          {children}
        </div>
      </main>

      {/* Mobile bottom tab bar + More sheet */}
      <BottomNav email={session.email} logout={logout} />

      {/* Toasts (reads server-redirect params + client toast() calls) */}
      <Suspense fallback={null}>
        <Toaster />
      </Suspense>
    </div>
  );
}

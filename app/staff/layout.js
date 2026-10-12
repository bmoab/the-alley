import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSignedInUser, clearSessionCookie, isStaffRole } from "@/lib/auth.js";
import StaffNav from "@/components/staff/StaffNav.js";
import Toaster from "@/components/admin/ui/Toaster.js";

export const metadata = { title: { default: "Staff", template: "%s · Staff · The Alley" } };
export const dynamic = "force-dynamic";

async function logout() {
  "use server";
  clearSessionCookie();
  redirect("/admin/login");
}

/**
 * The staff area: an employee's shifts and the schedule. (Clocking in, hours
 * and pay are in Square.) Any signed-in person may come here — an owner or admin who also
 * works shifts uses the same pages — but a staff login can go NOWHERE else.
 */
export default async function StaffLayout({ children }) {
  const user = await getSignedInUser();
  if (!user) redirect("/admin/login");
  if (user.must_change_password) redirect("/admin/set-password");

  return (
    <div className="admin-ui min-h-screen bg-paper-warm">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2.5 px-4 py-3">
          <Image src="/brand/emblem-black.png" alt="The Alley" width={28} height={28} className="h-7 w-7 object-contain" />
          <span className="text-sm font-semibold text-ink">
            The Alley <span className="text-verde-deep">Staff</span>
          </span>
          <div className="ml-auto flex items-center gap-3 text-xs">
            {!isStaffRole(user) ? (
              <Link href="/admin" className="font-semibold text-ink-muted hover:text-ink">
                ← Admin
              </Link>
            ) : null}
            <form action={logout}>
              <button className="font-semibold text-ink-muted hover:text-ink">Sign out</button>
            </form>
          </div>
        </div>
        <StaffNav />
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 pb-16">{children}</main>

      <Suspense fallback={null}>
        <Toaster />
      </Suspense>
    </div>
  );
}

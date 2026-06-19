import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession, clearSessionCookie } from "@/lib/auth.js";

async function logout() {
  "use server";
  clearSessionCookie();
  redirect("/admin/login");
}

// Nav with an optional grouped section (Reservations).
const NAV = [
  { href: "/admin", label: "Dashboard" },
  {
    group: "Reservations",
    items: [
      { href: "/admin/requests", label: "Requests" },
      { href: "/admin/bookings", label: "Bookings" },
      { href: "/admin/deposits", label: "Deposits" },
    ],
  },
  { href: "/admin/calendar", label: "Calendar" },
  { href: "/admin/events", label: "Public Events" },
  { href: "/admin/directory", label: "Directory" },
  { href: "/admin/suites", label: "Suites" },
  { href: "/admin/exhibitors", label: "Exhibitors" },
  { href: "/admin/gallery", label: "Gallery" },
  { href: "/admin/content", label: "Site Content" },
  { href: "/admin/settings", label: "Settings" },
];

export default async function AdminLayout({ children }) {
  const session = await getSession();
  if (!session) redirect("/admin/login");

  return (
    <div className="admin-ui min-h-screen bg-paper-warm lg:flex">
      {/* Sidebar */}
      <aside className="border-b border-ink/10 bg-ink text-paper lg:min-h-screen lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r lg:border-ink/40">
        <div className="flex items-center justify-between p-5 lg:block">
          <Link href="/admin" className="font-display text-xl font-semibold">
            The Alley <span className="text-brass-light">Admin</span>
          </Link>
          <p className="hidden text-xs text-paper/50 lg:mt-1 lg:block">
            {session.email}
          </p>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:gap-0.5 lg:px-3">
          {NAV.map((item) =>
            item.group ? (
              <div key={item.group} className="contents lg:mt-2 lg:block">
                <p className="hidden px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-paper/40 lg:block">
                  {item.group}
                </p>
                {item.items.map((sub) => (
                  <Link
                    key={sub.href}
                    href={sub.href}
                    className="whitespace-nowrap rounded-lg px-3 py-2 text-sm text-paper/75 transition hover:bg-ink-soft hover:text-paper lg:ml-2"
                  >
                    {sub.label}
                  </Link>
                ))}
              </div>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className="whitespace-nowrap rounded-lg px-3 py-2 text-sm text-paper/75 transition hover:bg-ink-soft hover:text-paper"
              >
                {item.label}
              </Link>
            )
          )}
        </nav>
        <div className="hidden border-t border-ink/40 p-3 lg:block">
          <Link
            href="/"
            className="block rounded-lg px-3 py-2 text-sm text-paper/60 hover:text-paper"
          >
            ↗ View website
          </Link>
          <form action={logout}>
            <button className="w-full rounded-lg px-3 py-2 text-left text-sm text-paper/60 hover:text-paper">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1">
        <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">{children}</div>
      </main>
    </div>
  );
}

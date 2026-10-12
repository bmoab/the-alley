"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarClock, CalendarRange } from "lucide-react";
import { cx } from "@/components/admin/ui/cx.js";

// The staff area's whole navigation. Mobile-first: these sit in a row under the
// header on every screen size, since there are only a handful.
export const STAFF_NAV = [
  { href: "/staff", label: "Shifts", icon: CalendarClock },
  { href: "/staff/schedule", label: "Schedule", icon: CalendarRange },
];

export default function StaffNav() {
  const pathname = usePathname();
  return (
    <nav className="mx-auto flex max-w-3xl gap-0.5 overflow-x-auto px-2 sm:px-4">
      {STAFF_NAV.map(({ href, label, icon: Icon }) => {
        const active = href === "/staff" ? pathname === "/staff" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cx(
              "flex shrink-0 items-center gap-1 border-b-2 px-2.5 py-2.5 text-sm font-semibold transition-colors",
              active ? "border-ink text-ink" : "border-transparent text-ink-muted hover:text-ink"
            )}
          >
            <Icon className="hidden h-4 w-4 sm:block" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

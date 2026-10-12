"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/admin/ui/cx.js";

// The account's whole navigation — a row of tabs under the header.
export default function AccountNav({ unread = 0 }) {
  const pathname = usePathname();
  const tabs = [
    { href: "/account", label: "Home" },
    { href: "/account/inbox", label: "Inbox" },
    { href: "/account/settings", label: "Settings" },
  ];
  return (
    <nav className="mx-auto flex max-w-3xl gap-0.5 overflow-x-auto px-2 sm:px-4">
      {tabs.map(({ href, label }) => {
        const active = href === "/account" ? pathname === "/account" || pathname.startsWith("/account/consign") : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cx(
              "flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 py-2.5 text-sm font-semibold transition-colors",
              active ? "border-ink text-ink" : "border-transparent text-ink-muted hover:text-ink"
            )}
          >
            {label}
            {href === "/account/inbox" && unread ? (
              <span className="rounded-full bg-verde px-1.5 text-[11px] text-ink">{unread}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

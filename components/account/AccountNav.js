"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Inbox, Settings } from "lucide-react";

const TABS = [
  { href: "/account", label: "Home", icon: House },
  { href: "/account/inbox", label: "Inbox", icon: Inbox },
  { href: "/account/settings", label: "Settings", icon: Settings },
];

function isActive(pathname, href) {
  return href === "/account" ? pathname === "/account" || pathname.startsWith("/account/consign") : pathname.startsWith(href);
}

/** The account's tabs, in the header on a wide screen. */
export default function AccountNav({ unread = 0 }) {
  const pathname = usePathname();
  return (
    <nav className="ac-tabs" aria-label="Your account">
      {TABS.map(({ href, label }) => (
        <Link key={href} href={href} className="ac-tab" aria-current={isActive(pathname, href) ? "page" : undefined}>
          {label}
          {href === "/account/inbox" && unread ? <span className="ac-tab-count">{unread}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

/**
 * The same tabs as a bar along the bottom on a phone, where a thumb reaches.
 * Rendered OUTSIDE the header: the header's backdrop blur would otherwise
 * pin this "fixed" bar to the header instead of the screen.
 */
export function AccountMobileNav() {
  const pathname = usePathname();
  return (
    <nav className="ac-mobile-tabs" aria-label="Your account">
      {TABS.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} aria-current={isActive(pathname, href) ? "page" : undefined}>
          <Icon aria-hidden="true" strokeWidth={1.6} />
          {label}
        </Link>
      ))}
    </nav>
  );
}

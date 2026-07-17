"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ExternalLink, LogOut } from "lucide-react";
import NavGroup from "./NavGroup.js";
import { navFor, isActive } from "./nav-config.js";
import { cx } from "./ui/cx.js";

/**
 * Desktop sidebar (lg+). Light & airy: white surface, charcoal text, verde
 * active state with a sage accent bar. Footer actions (View website / Sign out)
 * are always visible here. `logout` is a server action passed from the layout.
 */
export default function AdminNav({ email, isOwner = false, canManageBookings = false, logout }) {
  const pathname = usePathname();
  const nav = navFor({ isOwner, canManageBookings });

  return (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-5 pb-5 pt-6">
        <Image
          src="/brand/emblem-black.png"
          alt="The Alley"
          width={32}
          height={32}
          className="h-8 w-8 object-contain"
        />
        <div className="leading-tight">
          <div className="text-sm font-semibold text-ink">The Alley</div>
          <div className="text-xs font-medium text-verde-deep">Admin</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3">
        {nav.map((item) =>
          item.group ? (
            <NavGroup
              key={item.group}
              label={item.group}
              icon={item.icon}
              items={item.items}
            />
          ) : (
            <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} />
          )
        )}
      </nav>

      {/* Footer */}
      <div className="mt-2 border-t border-line px-3 py-3">
        {email ? (
          <p className="truncate px-3 pb-2 text-xs text-ink-muted">{email}</p>
        ) : null}
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-soft transition hover:bg-paper-dim hover:text-ink"
        >
          <ExternalLink className="h-4 w-4" />
          View website
        </Link>
        <form action={logout}>
          <button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-ink-soft transition hover:bg-paper-dim hover:text-ink">
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}

function NavLink({ item, active }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition",
        active
          ? "bg-verde/70 text-ink"
          : "text-ink-soft hover:bg-paper-dim hover:text-ink"
      )}
    >
      {active ? (
        <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r bg-verde-deep" />
      ) : null}
      {Icon ? (
        <Icon
          className={cx("h-[18px] w-[18px] shrink-0", active ? "text-verde-deep" : "")}
        />
      ) : null}
      {item.label}
    </Link>
  );
}

"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X, ExternalLink, LogOut } from "lucide-react";
import { navFor, PRIMARY_TABS, isActive } from "./nav-config.js";
import { cx } from "./ui/cx.js";

/**
 * Mobile navigation (below lg). A fixed bottom tab bar with the 4 primary
 * destinations + a "More" tab that opens a slide-up sheet containing every
 * section plus View website / Sign out / the signed-in email — the actions
 * that were previously unreachable on a phone.
 */
export default function BottomNav({ email, isOwner = false, logout }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const nav = navFor(isOwner);

  // Close the sheet on navigation.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while the sheet is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // "More" is highlighted when the current page isn't one of the primary tabs.
  const onPrimary = PRIMARY_TABS.some((t) => isActive(pathname, t.href));

  return (
    <>
      {/* Slide-up sheet */}
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 animate-fade-in bg-ink/40"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[82vh] animate-slide-up overflow-y-auto rounded-t-2xl border-t border-line bg-paper pb-[max(1rem,env(safe-area-inset-bottom))] shadow-sheet">
            <div className="sticky top-0 flex items-center justify-between border-b border-line bg-paper px-5 py-3.5">
              <span className="text-sm font-semibold text-ink">Menu</span>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-ink-muted transition hover:bg-paper-dim hover:text-ink"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-3 py-3">
              {nav.map((item) =>
                item.group ? (
                  <div key={item.group} className="mb-1 mt-3 first:mt-0">
                    <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-ink-muted">
                      {item.group}
                    </p>
                    {item.items.map((sub) => (
                      <SheetLink key={sub.href} item={sub} active={isActive(pathname, sub.href)} />
                    ))}
                  </div>
                ) : (
                  <SheetLink key={item.href} item={item} active={isActive(pathname, item.href)} />
                )
              )}

              <div className="mt-3 border-t border-line pt-3">
                {email ? (
                  <p className="truncate px-3 pb-1 text-xs text-ink-muted">{email}</p>
                ) : null}
                <Link
                  href="/"
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink-soft transition hover:bg-paper-dim hover:text-ink"
                >
                  <ExternalLink className="h-[18px] w-[18px]" />
                  View website
                </Link>
                <form action={logout}>
                  <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-ink-soft transition hover:bg-paper-dim hover:text-ink">
                    <LogOut className="h-[18px] w-[18px]" />
                    Sign out
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Fixed bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {PRIMARY_TABS.map((tab) => {
          const active = isActive(pathname, tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors",
                active ? "text-verde-deep" : "text-ink-muted"
              )}
            >
              <Icon className="h-[22px] w-[22px]" />
              {tab.label}
            </Link>
          );
        })}
        <button
          onClick={() => setOpen(true)}
          aria-expanded={open}
          className={cx(
            "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors",
            !onPrimary ? "text-verde-deep" : "text-ink-muted"
          )}
        >
          <Menu className="h-[22px] w-[22px]" />
          More
        </button>
      </nav>
    </>
  );
}

function SheetLink({ item, active }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
        active ? "bg-verde/70 font-medium text-ink" : "text-ink-soft hover:bg-paper-dim hover:text-ink"
      )}
    >
      {Icon ? (
        <Icon className={cx("h-[18px] w-[18px] shrink-0", active ? "text-verde-deep" : "")} />
      ) : null}
      {item.label}
    </Link>
  );
}

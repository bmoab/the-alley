"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { NAV, SECONDARY } from "@/components/site/nav.js";
import { useScrolled, useBodyScrollLock } from "@/components/hooks.js";

export default function SiteHeader() {
  const pathname = usePathname();
  const scrolled = useScrolled(40);
  // The Gallery is a dark page: use a solid dark nav from the top (no
  // transparent-hero state) so it doesn't flicker clear→verde over the dark hall.
  const dark = pathname === "/gallery";
  const [menuOpen, setMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useBodyScrollLock(menuOpen);
  useEffect(() => setMounted(true), []);

  const isActive = (href) => pathname === href || pathname.startsWith(href + "/");

  return (
    <header className="sh" data-on={scrolled || dark ? "true" : "false"} data-theme={dark ? "dark" : undefined}>
      <div className="sh-inner">
        <Link href="/" className="sh-logo" aria-label="The Alley On Center — home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={dark ? "/brand/logo-horizontal-white.png" : "/brand/logo-horizontal-black.png"} alt="The Alley On Center" />
        </Link>

        <nav className="sh-nav" aria-label="Primary">
          {NAV.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`sh-link${isActive(l.href) ? " is-active" : ""}`}
            >
              {l.label}
            </Link>
          ))}
          <div className="sh-more">
            <button type="button" className="sh-link sh-more-btn" aria-haspopup="true">
              More
              <svg width="9" height="6" viewBox="0 0 10 6" aria-hidden="true" style={{ marginLeft: 6 }}>
                <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div className="sh-more-panel">
              {SECONDARY.map((l) => (
                <Link key={l.href} href={l.href} className={`sh-more-link${isActive(l.href) ? " is-active" : ""}`}>
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
        </nav>

        <div className="sh-actions">
          <Link href="/spaces" className="btn btn--solid sh-cta">
            <span className="sh-cta-full">Request to Book</span>
            <span className="sh-cta-short">Book</span>
          </Link>
          <button
            className="sh-burger"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true">
              <path d="M0 1h18M0 7h18M0 13h18" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </button>
        </div>
      </div>

      {menuOpen && mounted
        ? createPortal(
        <div className="sh-sheet" onClick={() => setMenuOpen(false)}>
          <nav className="sh-sheet-nav" onClick={(e) => e.stopPropagation()} aria-label="Mobile">
            <button className="sh-sheet-x" aria-label="Close menu" onClick={() => setMenuOpen(false)}>
              ×
            </button>
            {[...NAV, ...SECONDARY].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={isActive(l.href) ? "is-active" : ""}
                onClick={() => setMenuOpen(false)}
              >
                {l.label}
              </Link>
            ))}
            <Link href="/spaces" className="btn btn--solid" style={{ marginTop: 18 }} onClick={() => setMenuOpen(false)}>
              Request to Book
            </Link>
          </nav>
        </div>,
            document.body
          )
        : null}
    </header>
  );
}

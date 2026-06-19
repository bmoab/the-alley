"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { NAV } from "@/components/site/nav.js";
import { useScrolled, useBodyScrollLock } from "@/components/hooks.js";

export default function SiteHeader() {
  const pathname = usePathname();
  const scrolled = useScrolled(40);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useBodyScrollLock(menuOpen);
  useEffect(() => setMounted(true), []);

  const isActive = (href) => pathname === href || pathname.startsWith(href + "/");

  return (
    <header className="sh" data-on={scrolled ? "true" : "false"}>
      <div className="sh-inner">
        <Link href="/" className="sh-logo" aria-label="The Alley On Center — home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-horizontal-black.png" alt="The Alley On Center" />
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
        </nav>

        <div className="sh-actions">
          <Link href="/spaces" className="btn btn--solid sh-cta">
            Request to Book
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
            {NAV.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={isActive(l.href) ? "is-active" : ""}
                onClick={() => setMenuOpen(false)}
              >
                {l.label}
              </Link>
            ))}
            <Link href="/about" className={isActive("/about") ? "is-active" : ""} onClick={() => setMenuOpen(false)}>
              About
            </Link>
            <Link href="/contact" className={isActive("/contact") ? "is-active" : ""} onClick={() => setMenuOpen(false)}>
              Contact
            </Link>
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

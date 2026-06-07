"use client";
import Link from "next/link";
import { useState } from "react";

const LINKS = [
  { href: "/directory", label: "Directory" },
  { href: "/spaces", label: "The Loft" },
  { href: "/gallery", label: "The Alley Gallery" },
  { href: "/art-beat", label: "Center Street Art Beat" },
  { href: "/events", label: "Calendar" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export default function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-paper/85 backdrop-blur">
      <div className="container-content flex items-center justify-between py-4">
        <Link href="/" className="font-display text-xl font-semibold tracking-tight text-ink">
          The Alley <span className="text-brass-dark">On Center</span>
        </Link>

        <nav className="hidden items-center gap-5 lg:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="whitespace-nowrap text-sm font-medium text-ink-soft transition hover:text-ink"
            >
              {l.label}
            </Link>
          ))}
          <Link href="/book" className="btn-accent !px-5 !py-2 text-sm">
            Request to Book
          </Link>
        </nav>

        <button
          className="lg:hidden"
          aria-label="Toggle menu"
          onClick={() => setOpen((v) => !v)}
        >
          <div className="space-y-1.5">
            <span className="block h-0.5 w-6 bg-ink" />
            <span className="block h-0.5 w-6 bg-ink" />
            <span className="block h-0.5 w-6 bg-ink" />
          </div>
        </button>
      </div>

      {open ? (
        <div className="border-t border-ink/10 bg-paper lg:hidden">
          <nav className="container-content flex flex-col gap-1 py-3">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-2 text-sm font-medium text-ink-soft hover:bg-paper-warm"
              >
                {l.label}
              </Link>
            ))}
            <Link
              href="/book"
              onClick={() => setOpen(false)}
              className="btn-accent mt-2 w-full"
            >
              Request to Book
            </Link>
          </nav>
        </div>
      ) : null}
    </header>
  );
}

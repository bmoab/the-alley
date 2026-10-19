import { House, Inbox, Settings } from "lucide-react";
import { requireAdmin } from "@/lib/auth.js";
import { tourMode, TOUR_LINKS } from "@/lib/account-tour.js";
import AccountDashboard from "@/components/account/AccountDashboard.js";
import TourGuard from "@/components/admin/tour/TourGuard.js";
import "@/app/account/account.css";

export const metadata = { title: "Account tour", robots: { index: false } };
export const dynamic = "force-dynamic";

const TABS = [
  ["Home", "#t-home", House],
  ["Inbox", "#t-inbox", Inbox],
  ["Settings", "#t-settings", Settings],
];

/**
 * The account page as a sample customer sees it, for the account tour's
 * preview window (Admin → Account tour). Same page, same look, sample data;
 * links explain themselves instead of going anywhere.
 */
export default async function TourFrame({ searchParams }) {
  await requireAdmin();
  const m = tourMode(searchParams?.as);
  const initials = m.account.name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="ac">
      <header className="ac-top">
        <div className="ac-top-in">
          <a href="#t-home" className="ac-top-logo" aria-label="The Alley On Center — home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-horizontal-black.png" alt="The Alley On Center" />
          </a>
          <nav className="ac-tabs" aria-label="Your account">
            {TABS.map(([label, href], i) => (
              <a key={label} href={href} className="ac-tab" aria-current={i === 0 ? "page" : undefined}>
                {label}
              </a>
            ))}
          </nav>
          <a href="#t-settings" className="ac-me">
            <span className="ac-me-email">{m.account.email}</span>
            <span className="ac-avatar" aria-hidden="true">{initials}</span>
          </a>
        </div>
      </header>
      <main className="ac-main">
        <AccountDashboard
          account={m.account}
          mine={m.mine}
          inbox={m.inbox}
          makerStats={m.makerStats}
          bills={m.bills}
          schedule={m.schedule}
          demo
        />
      </main>
      <nav className="ac-mobile-tabs" aria-label="Your account">
        {TABS.map(([label, href, Icon], i) => (
          <a key={label} href={href} aria-current={i === 0 ? "page" : undefined}>
            <Icon aria-hidden="true" strokeWidth={1.6} />
            {label}
          </a>
        ))}
      </nav>
      <TourGuard links={TOUR_LINKS} />
    </div>
  );
}

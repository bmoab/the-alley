import { History, House, Settings } from "lucide-react";
import { tourHref } from "@/lib/account-tour.js";

const initials = (name) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const TABS = [
  ["home", "Home", House],
  ["activity", "Activity", History],
  ["settings", "Settings", Settings],
];

/** The signed-in account's frame (like app/account/(app)/layout.js), for the tour. */
export function AccountChrome({ m, tab = "home", children }) {
  return (
    <>
      <header className="ac-top">
        <div className="ac-top-in">
          <a href={tourHref(m.key)} className="ac-top-logo" aria-label="Your account">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-horizontal-black.png" alt="The Alley On Center" />
          </a>
          <nav className="ac-tabs" aria-label="Your account">
            {TABS.map(([key, label]) => (
              <a key={key} href={tourHref(m.key, key)} className="ac-tab" aria-current={tab === key ? "page" : undefined}>
                {label}
              </a>
            ))}
          </nav>
          <a href={tourHref(m.key, "settings")} className="ac-me">
            <span className="ac-me-email">{m.account.email}</span>
            <span className="ac-avatar" aria-hidden="true">{initials(m.account.name)}</span>
          </a>
        </div>
      </header>
      <main className="ac-main">{children}</main>
      <nav className="ac-mobile-tabs" aria-label="Your account">
        {TABS.map(([key, label, Icon]) => (
          <a key={key} href={tourHref(m.key, key)} aria-current={tab === key ? "page" : undefined}>
            <Icon aria-hidden="true" strokeWidth={1.6} />
            {label}
          </a>
        ))}
      </nav>
    </>
  );
}

/**
 * The private-link pages' frame (like components/account/PortalFrame.js, signed
 * in), for the tour: the label in the middle, "Your account" in the corner.
 */
export function PortalChrome({ m, label, children }) {
  return (
    <div className="brandpage ac-portal">
      <header className="ac-top">
        <div className="ac-top-in">
          <a href={tourHref(m.key)} className="ac-top-logo" aria-label="Your account">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-horizontal-black.png" alt="The Alley On Center" />
          </a>
          {label ? <span className="ac-top-label" style={{ marginInline: "auto" }}>{label}</span> : <span style={{ marginInline: "auto" }} />}
          <a href={tourHref(m.key)} className="ac-me" title="Your account">
            <span className="ac-me-email">Your account</span>
            <span className="ac-avatar" aria-hidden="true">{initials(m.account.name)}</span>
          </a>
        </div>
      </header>
      <main className="ac-main ac-main--narrow">{children}</main>
    </div>
  );
}

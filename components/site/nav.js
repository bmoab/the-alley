// Public-site navigation (single source of truth for header + footer).
export const NAV = [
  { label: "Spaces", href: "/spaces" },
  { label: "Directory", href: "/directory" },
  { label: "Gallery", href: "/gallery" },
  { label: "Exhibitors", href: "/exhibitors" },
  { label: "Art Beat", href: "/art-beat" },
  { label: "Calendar", href: "/calendar" },
];

// Secondary pages — shown under a "More" dropdown on desktop and inline in the
// mobile menu, so the primary nav stays uncluttered.
export const SECONDARY = [
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

export const FOOTER_COLS = [
  {
    head: "Visit",
    links: [
      { t: "Spaces", h: "/spaces" },
      { t: "Directory", h: "/directory" },
      { t: "Gallery", h: "/gallery" },
      { t: "Exhibitors", h: "/exhibitors" },
      { t: "Art Beat", h: "/art-beat" },
      { t: "Calendar", h: "/calendar" },
    ],
  },
  {
    head: "Host with us",
    links: [
      { t: "Request to Book", h: "/spaces" },
      { t: "Rates & spaces", h: "/spaces" },
      { t: "About", h: "/about" },
      { t: "Contact", h: "/contact" },
      { t: "Owner login", h: "/admin" },
    ],
  },
];

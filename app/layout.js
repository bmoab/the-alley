import "./globals.css";
import { Josefin_Sans, Inter } from "next/font/google";

// Clean UI typeface for the admin backend (kept off the public site, which
// stays on-brand with Josefin Sans).
const ui = Inter({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
  variable: "--font-ui",
});

// Brand typeface (TheAlley_BrandGuide.pdf): Josefin Sans, Light through Bold —
// display weights (600/700) and body weights (300/400) come from this ONE
// instance.
//
// ⚠️ This was previously TWO Josefin_Sans() calls, one per CSS variable. Calling
// the same Google font twice makes next/font emit two separately-hashed font
// classes, and a build that reuses a partial cache can emit the class name from
// one hash and the @font-face CSS from the other. When that happened in
// production, `--font-archivo` resolved to EMPTY, which made
// `--font-body: var(--font-archivo), ...` invalid at computed-value time and
// dropped the whole site to Times. One instance can't desync with itself.
const display = Josefin_Sans({
  subsets: ["latin"],
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-display",
});

export const metadata = {
  title: {
    default: "The Alley On Center — Logan, Utah",
    template: "%s · The Alley On Center",
  },
  description:
    "An arts and event building in the heart of Logan, Utah. Tenant shops, rentable event spaces, a gallery, and a public calendar of classes and events.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${ui.variable}`}>
      <body>{children}</body>
    </html>
  );
}

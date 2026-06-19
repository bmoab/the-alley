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

// Brand typeface (TheAlley_BrandGuide.pdf): Josefin Sans.
// Display = Semibold/Bold; body = Light/Regular. Both exposed as CSS variables
// so the existing --font-display / --font-archivo references keep working.
const display = Josefin_Sans({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
});

const archivo = Josefin_Sans({
  subsets: ["latin"],
  display: "swap",
  weight: ["300", "400", "500", "600"],
  variable: "--font-archivo",
});

export const metadata = {
  title: {
    default: "The Alley On Center — Logan, Utah",
    template: "%s · The Alley On Center",
  },
  description:
    "An arts and event building in the heart of Logan, Utah. Tenant shops, two rentable event spaces, a gallery, and a public calendar of classes and events.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${archivo.variable} ${ui.variable}`}>
      <body>{children}</body>
    </html>
  );
}

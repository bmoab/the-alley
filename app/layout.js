import "./globals.css";
import { Space_Grotesk, Archivo } from "next/font/google";

// Display: a geometric grotesque matching the live site's headings/wordmark.
const display = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
});

const archivo = Archivo({
  subsets: ["latin"],
  display: "swap",
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
    <html lang="en" className={`${display.variable} ${archivo.variable}`}>
      <body>{children}</body>
    </html>
  );
}

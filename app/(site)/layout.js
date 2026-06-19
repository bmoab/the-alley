import "./site.css";
import SiteHeader from "@/components/SiteHeader.js";
import SiteFooter from "@/components/SiteFooter.js";
import RevealMount from "@/components/site/RevealMount.js";
import { BookProvider } from "@/components/BookContext.js";
import { getSettings } from "@/lib/db.js";

export default function SiteLayout({ children }) {
  const s = getSettings();
  const bookingConfig = {
    rate: Number(s.standard_rate) || 75,
    minHours: Number(s.minimum_hours) || 2,
    deposit: Number(s.deposit) || 150,
    openHour: Number(s.open_hour) || 8,
    closeHour: Number(s.close_hour) || 23,
  };
  return (
    <div className="dir-b">
      <BookProvider config={bookingConfig}>
        <RevealMount />
        <SiteHeader />
        {children}
        <SiteFooter />
      </BookProvider>
    </div>
  );
}

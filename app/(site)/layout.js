import "./site.css";
import SiteHeader from "@/components/SiteHeader.js";
import SiteFooter from "@/components/SiteFooter.js";
import RevealMount from "@/components/site/RevealMount.js";
import PreviewBridge from "@/components/site/PreviewBridge.js";
import { BookProvider } from "@/components/BookContext.js";
import { getSettings } from "@/lib/db.js";

// Render public pages on demand (they read owner-editable data from the DB).
// This also keeps `next build` from prerendering — and thus from opening the
// database — at build time. Applies to every route under (site).
export const dynamic = "force-dynamic";

export default function SiteLayout({ children }) {
  const s = getSettings();
  const bookingConfig = {
    rate: Number(s.standard_rate) || 75,
    minHours: Number(s.minimum_hours) || 2,
    maxHours: Number(s.maximum_hours) || 8,
    minLeadHours: Number(s.min_lead_hours) || 0,
    deposit: Number(s.deposit) || 150,
    openHour: Number(s.open_hour) || 8,
    closeHour: Number(s.close_hour) || 23,
    cleanupBuffer: (Number(s.cleanup_buffer_minutes) || 60) / 60,
    cancellationCutoffHours: Number(s.cancellation_cutoff_hours) || 72,
    seriesMaxOcc: Number(s.series_max_occurrences) || 8,
  };
  return (
    <div className="dir-b">
      <BookProvider config={bookingConfig}>
        <RevealMount />
        <PreviewBridge />
        <SiteHeader />
        {children}
        <SiteFooter />
      </BookProvider>
    </div>
  );
}

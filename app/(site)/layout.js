import SiteHeader from "@/components/SiteHeader.js";
import SiteFooter from "@/components/SiteFooter.js";
import { VerticalWordmark } from "@/components/Motifs.js";

export default function SiteLayout({ children }) {
  return (
    <>
      {/* Vertical wordmark down the left gutter (wide screens only) */}
      <div className="pointer-events-none fixed left-3 top-1/2 z-30 hidden -translate-y-1/2 2xl:block">
        <VerticalWordmark text="ALLEY ON CENTER" className="text-ink/40" />
      </div>
      <SiteHeader />
      <div className="min-h-screen">{children}</div>
      <SiteFooter />
    </>
  );
}

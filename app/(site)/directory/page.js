import { listPublicDirectory } from "@/lib/catalog.js";
import { getContentValue } from "@/lib/db.js";
import PageHero from "@/components/site/PageHero.js";
import BuildingDirectory from "@/components/BuildingDirectory.js";
import DirectoryGrid from "@/components/home/DirectoryGrid.js";

export const metadata = { title: "Directory" };

export default function DirectoryPage() {
  const tenants = listPublicDirectory();
  const phone = (getContentValue("contact_phone", "(435) 512-4608") || "").replace(/[^\d]/g, "") || "4355124608";

  return (
    <main className="ipage">
      <PageHero
        eyebrow="The makers"
        title="Directory"
        lede="Independent shops and practitioners who call The Alley home — clothing, cuts, ink, healing, and more, all under one roof."
      />
      <section className="wrap">
        <BuildingDirectory tenants={tenants} phone={phone} />

        <div className="dir-listhead">
          <h2 className="sec-title">Full directory</h2>
          <p className="dir-listsub">Every business in the building, by category.</p>
        </div>
        <DirectoryGrid tenants={tenants} showSuite showLink />

        <div className="lease-cta">
          <div>
            <h3>Want a suite at The Alley?</h3>
            <p>We&apos;re currently leasing studio + office space. Reach out and we&apos;ll show you what&apos;s open.</p>
          </div>
          <a className="btn btn--solid" href={`tel:${phone}`}>Call (435) 512-4608</a>
        </div>
      </section>
    </main>
  );
}

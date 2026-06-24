import { listPublicDirectoryWithSuites, getDirectoryMapData } from "@/lib/catalog.js";
import { getContentValue } from "@/lib/db.js";
import PageHero from "@/components/site/PageHero.js";
import BuildingDirectory from "@/components/BuildingDirectory.js";
import DirectoryGrid from "@/components/home/DirectoryGrid.js";

export const metadata = { title: "Directory" };

export default function DirectoryPage() {
  const tenants = listPublicDirectoryWithSuites();
  const zones = getDirectoryMapData();
  const phone = (getContentValue("contact_phone", "(435) 512-4608") || "").replace(/[^\d]/g, "") || "4355124608";

  return (
    <main className="ipage">
      <PageHero
        eyebrow={getContentValue("directory_hero_eyebrow", "The makers")}
        title={getContentValue("directory_hero_title", "Directory")}
        lede={getContentValue(
          "directory_hero_lede",
          "Independent shops and practitioners who call The Alley home — clothing, cuts, ink, healing, and more, all under one roof."
        )}
        editKeys={{ eyebrow: "directory_hero_eyebrow", title: "directory_hero_title", lede: "directory_hero_lede" }}
      />
      <section className="wrap">
        <BuildingDirectory zones={zones} phone={phone} />

        <div className="dir-listhead">
          <h2 className="sec-title" data-edit="directory_list_heading">{getContentValue("directory_list_heading", "Full directory")}</h2>
          <p className="dir-listsub" data-edit="directory_list_subhead">{getContentValue("directory_list_subhead", "Every business in the building, by category.")}</p>
        </div>
        <DirectoryGrid tenants={tenants} showSuite showLink />

        <div className="lease-cta">
          <div>
            <h3>Want a suite at The Alley?</h3>
            <p data-edit="directory_leasing_blurb">{getContentValue("directory_leasing_blurb", "We're currently leasing studio + office space. Reach out and we'll show you what's open.")}</p>
          </div>
          <a className="btn btn--solid" href={`tel:${phone}`}>Call (435) 512-4608</a>
        </div>
      </section>
    </main>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth.js";
import { getVendor, artistForVendor } from "@/lib/inventory.js";
import MakerHome from "@/components/maker/MakerHome.js";
import PortalFrame from "@/components/account/PortalFrame.js";
import PreviewGuard from "@/components/admin/PreviewGuard.js";

export const metadata = { title: "Their page", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * A maker's (or artist's) page exactly as they see it on their private link
 * or account, for the team (Makers → a maker → See their page). Nothing here
 * acts for them: no form posts (no token goes with them either), and their
 * private costs are left out.
 */
export default async function MakerViewPage({ params }) {
  await requireAdmin();
  const vendor = getVendor(Number(params.id));
  if (!vendor) notFound();
  const artist = artistForVendor(vendor);
  return (
    <>
      <div className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-ink px-4 py-2 text-center text-sm text-paper">
        <span>
          You&apos;re seeing <strong>{vendor.name}</strong>&apos;s page the way they see it. Nothing you do here is saved.
        </span>
        <Link href={`/admin/vendors/${vendor.id}`} className="font-semibold underline">
          Back to the admin
        </Link>
      </div>
      <PortalFrame label={artist ? "Art sales" : "Consignment"}>
        <MakerHome vendorId={vendor.id} hidden={{}} preview />
      </PortalFrame>
      <PreviewGuard message={`Only ${vendor.name} can do this, from their own page.`} />
    </>
  );
}

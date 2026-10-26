import { revalidatePath } from "next/cache";
import {
  getExhibitorByToken,
  saveExhibitorListing,
  addExhibitorPhoto,
  deleteExhibitorPhoto,
  listExhibitorPhotos,
  parseExhibitorLinks,
} from "@/lib/catalog.js";
import Link from "next/link";
import { makerForExhibitor } from "@/lib/agreement-reminders.js";
import ExhibitorEditForm from "@/components/ExhibitorEditForm.js";
import MakerHome from "@/components/maker/MakerHome.js";
import AccountNudge from "@/components/account/AccountNudge.js";
import PortalFrame, { PortalHead, PortalMissing } from "@/components/account/PortalFrame.js";

export const metadata = { title: "Set up your exhibitor page" };
// Per-token page: never cache one artist's sales and serve them to another.
export const dynamic = "force-dynamic";

function refresh() {
  revalidatePath("/exhibitors");
  revalidatePath("/");
  revalidatePath("/admin/exhibitors");
}

export default function ExhibitorTokenPage({ params, searchParams }) {
  const exhibitor = getExhibitorByToken(params.token);

  if (!exhibitor) {
    return (
      <PortalFrame label="Exhibitor page">
        <PortalMissing>
          This exhibitor link is invalid or has expired. Check your email for the right link, or sign in to your account.
        </PortalMissing>
      </PortalFrame>
    );
  }

  async function save(data) {
    "use server";
    saveExhibitorListing(params.token, data);
    refresh();
    return { ok: true };
  }

  async function addPhoto(data) {
    "use server";
    const ex = getExhibitorByToken(params.token);
    if (!ex) return { ok: false, error: "Link expired." };
    if (data.image_path) addExhibitorPhoto(ex.id, data.image_path, data.caption || null, listExhibitorPhotos(ex.id).length);
    refresh();
    return { ok: true, works: listExhibitorPhotos(ex.id) };
  }

  async function removePhoto(photoId) {
    "use server";
    const ex = getExhibitorByToken(params.token);
    if (!ex) return { ok: false, error: "Link expired." };
    // Only allow removing a photo that belongs to this exhibitor.
    const owned = listExhibitorPhotos(ex.id).some((w) => w.id === Number(photoId));
    if (owned) deleteExhibitorPhoto(Number(photoId));
    refresh();
    return { ok: true, works: listExhibitorPhotos(ex.id) };
  }

  // An artist whose work we sell: their sales and payouts on a second tab.
  const vendor = makerForExhibitor(exhibitor);
  const sells = !!vendor?.is_active;
  const onSales = sells && searchParams?.tab === "sales";
  const tabs = sells ? (
    <nav className="ac-seg" aria-label="Your exhibitor link">
      <Link href={`/exhibitor/${params.token}`} aria-current={onSales ? undefined : "page"}>
        Your page
      </Link>
      <Link href={`/exhibitor/${params.token}?tab=sales`} aria-current={onSales ? "page" : undefined}>
        Sales &amp; payouts
      </Link>
    </nav>
  ) : null;

  if (onSales) {
    return (
      <PortalFrame label="Exhibitor page" toaster>
        {tabs}
        <MakerHome vendorId={vendor.id} hidden={{ artist: params.token }} notice={<AccountNudge email={exhibitor.contact_email} />} />
      </PortalFrame>
    );
  }

  return (
    <PortalFrame label="Exhibitor page" toaster={sells}>
      {tabs}
      <PortalHead eyebrow="Your private exhibitor link" title="Set up your page">
        Your spot on The Alley&apos;s Exhibitors page: your bio, a profile photo and photos of your work. Changes go live on
        our website right away.
      </PortalHead>
      <AccountNudge email={exhibitor.contact_email} />

      <div style={{ marginTop: 36 }}>
        <ExhibitorEditForm
          exhibitor={{ ...exhibitor, links: parseExhibitorLinks(exhibitor) }}
          saveAction={save}
          addPhotoAction={addPhoto}
          removePhotoAction={removePhoto}
        />
      </div>
    </PortalFrame>
  );
}

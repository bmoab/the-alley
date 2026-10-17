import { revalidatePath } from "next/cache";
import {
  getExhibitorByToken,
  saveExhibitorListing,
  addExhibitorPhoto,
  deleteExhibitorPhoto,
  listExhibitorPhotos,
  parseExhibitorLinks,
} from "@/lib/catalog.js";
import ExhibitorEditForm from "@/components/ExhibitorEditForm.js";
import AccountNudge from "@/components/account/AccountNudge.js";
import PortalFrame, { PortalHead, PortalMissing } from "@/components/account/PortalFrame.js";

export const metadata = { title: "Set up your exhibitor page" };

function refresh() {
  revalidatePath("/exhibitors");
  revalidatePath("/");
  revalidatePath("/admin/exhibitors");
}

export default function ExhibitorTokenPage({ params }) {
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

  return (
    <PortalFrame label="Exhibitor page">
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

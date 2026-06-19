import Link from "next/link";
import { revalidatePath } from "next/cache";
import {
  getExhibitorByToken,
  saveExhibitorListing,
  addExhibitorPhoto,
  deleteExhibitorPhoto,
  listExhibitorPhotos,
} from "@/lib/catalog.js";
import ExhibitorEditForm from "@/components/ExhibitorEditForm.js";

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
      <main className="flex min-h-screen items-center justify-center bg-paper-warm px-5">
        <div className="card max-w-md p-8 text-center">
          <h1 className="font-display text-2xl font-semibold text-ink">Link not found</h1>
          <p className="mt-3 text-ink-muted">
            This exhibitor link is invalid or has expired. Check your email for the correct link, or contact The Alley.
          </p>
          <Link href="/" className="btn-primary mt-6">Visit The Alley</Link>
        </div>
      </main>
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
    <main className="min-h-screen bg-paper-warm">
      <header className="border-b border-ink/10 bg-paper">
        <div className="container-content flex items-center justify-between py-4">
          <Link href="/" className="font-display text-xl font-semibold text-ink">
            The Alley <span className="text-brass-dark">On Center</span>
          </Link>
          <span className="text-sm text-ink-muted">Exhibitor page</span>
        </div>
      </header>

      <div className="container-content max-w-2xl py-10">
        <p className="eyebrow">Your private exhibitor link</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-ink">Set up your page</h1>
        <p className="mt-2 text-ink-muted">
          This is your spot on The Alley&apos;s Exhibitors page. Add your bio, a profile photo, and photos of your
          work — changes go live on our website right away. Bookmark this link to edit anytime.
        </p>

        <div className="mt-8">
          <ExhibitorEditForm
            exhibitor={exhibitor}
            saveAction={save}
            addPhotoAction={addPhoto}
            removePhotoAction={removePhoto}
          />
        </div>
      </div>
    </main>
  );
}

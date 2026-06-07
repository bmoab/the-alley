import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  listGallery,
  createGalleryImage,
  deleteGalleryImage,
} from "@/lib/catalog.js";
import Placeholder from "@/components/Placeholder.js";

export const metadata = { title: "Gallery" };

function refresh() {
  revalidatePath("/gallery");
  revalidatePath("/admin/gallery");
}

async function addImage(formData) {
  "use server";
  const path = (formData.get("image_path") || "").toString().trim();
  if (!path) redirect("/admin/gallery");
  createGalleryImage(
    path,
    (formData.get("caption") || "").toString().trim() || null,
    formData.get("sort_order")
  );
  refresh();
  redirect("/admin/gallery");
}

async function removeImage(formData) {
  "use server";
  deleteGalleryImage(Number(formData.get("id")));
  refresh();
  redirect("/admin/gallery");
}

export default function GalleryAdminPage() {
  const images = listGallery();

  return (
    <div>
      <p className="eyebrow">Admin</p>
      <h1 className="font-display text-3xl font-semibold text-ink">Gallery</h1>
      <p className="mt-1 text-ink-muted">
        Photos shown on the public Gallery page.
      </p>

      <div className="mt-6 card p-5">
        <h2 className="font-semibold text-ink">Add a photo</h2>
        <p className="mt-1 text-xs text-ink-muted">
          Paste an image URL or a path. Drag-and-drop file upload is added with
          the upload system in a later build step.
        </p>
        <form action={addImage} className="mt-4 grid gap-3 sm:grid-cols-12">
          <input name="image_path" required placeholder="https://… or /uploads/photo.jpg" className="field sm:col-span-6" />
          <input name="caption" placeholder="Caption (optional)" className="field sm:col-span-4" />
          <input name="sort_order" type="number" defaultValue={0} className="field sm:col-span-1" title="Sort order" />
          <button className="btn-primary sm:col-span-1">Add</button>
        </form>
      </div>

      {images.length === 0 ? (
        <div className="mt-6 card p-10 text-center text-ink-muted">
          No photos yet.
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((img, i) => (
            <div key={img.id} className="card overflow-hidden">
              <Placeholder src={img.image_path} label={img.caption || "Photo"} seed={i} className="h-32 w-full" rounded="rounded-none" />
              <div className="p-3">
                <div className="truncate text-xs text-ink-muted" title={img.caption || img.image_path}>
                  {img.caption || img.image_path}
                </div>
                <form action={removeImage} className="mt-2">
                  <input type="hidden" name="id" value={img.id} />
                  <button className="text-xs font-semibold text-rust hover:underline">Remove</button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

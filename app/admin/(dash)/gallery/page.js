import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  listGallery,
  createGalleryImage,
  updateGalleryImage,
  deleteGalleryImage,
} from "@/lib/catalog.js";
import Placeholder from "@/components/Placeholder.js";
import ContentImageField from "@/components/ContentImageField.js";

export const metadata = { title: "Gallery" };

function refresh() {
  revalidatePath("/gallery");
  revalidatePath("/admin/gallery");
}

function parseTagsInput(value) {
  return (value || "")
    .toString()
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

async function addImage(formData) {
  "use server";
  const path = (formData.get("image_path") || "").toString().trim();
  if (!path) redirect("/admin/gallery");
  createGalleryImage(
    path,
    (formData.get("caption") || "").toString().trim() || null,
    parseTagsInput(formData.get("tags")),
    formData.get("sort_order")
  );
  refresh();
  redirect("/admin/gallery");
}

async function saveImage(formData) {
  "use server";
  updateGalleryImage(Number(formData.get("id")), {
    caption: (formData.get("caption") || "").toString().trim() || null,
    tags: parseTagsInput(formData.get("tags")),
    sort_order: formData.get("sort_order"),
  });
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
        Photos shown on the public Gallery page. Tags become the filter chips
        visitors use to narrow the wall.
      </p>

      <div className="mt-6 card p-5">
        <h2 className="font-semibold text-ink">Add a photo</h2>
        <form action={addImage} className="mt-4 grid gap-3">
          <ContentImageField
            name="image_path"
            label="Photo"
            hint="Upload a JPG/PNG/WEBP. (You can also paste a path below instead.)"
          />
          <div className="grid gap-3 sm:grid-cols-12">
            <input name="caption" placeholder="Caption (e.g. First Friday opening)" className="field sm:col-span-6" />
            <input name="tags" placeholder="Tags, comma-separated (The Loft, Live Music)" className="field sm:col-span-5" />
            <input name="sort_order" type="number" defaultValue={0} className="field sm:col-span-1" title="Sort order" />
          </div>
          <button className="btn-primary w-fit">Add photo</button>
        </form>
      </div>

      {images.length === 0 ? (
        <div className="mt-6 card p-10 text-center text-ink-muted">No photos yet.</div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((img, i) => (
            <div key={img.id} className="card overflow-hidden">
              <Placeholder src={img.image_path} label={img.caption || "Photo"} seed={i} className="h-32 w-full" rounded="rounded-none" />
              <form action={saveImage} className="space-y-2 p-3">
                <input type="hidden" name="id" value={img.id} />
                <input name="caption" defaultValue={img.caption || ""} placeholder="Caption" className="field text-sm" />
                <input name="tags" defaultValue={(img.tagList || []).join(", ")} placeholder="Tags, comma-separated" className="field text-sm" />
                <div className="flex items-center gap-2">
                  <input name="sort_order" type="number" defaultValue={img.sort_order ?? 0} className="field w-20 text-sm" title="Sort order" />
                  <button className="btn-primary text-sm">Save</button>
                </div>
              </form>
              <form action={removeImage} className="px-3 pb-3">
                <input type="hidden" name="id" value={img.id} />
                <button className="text-xs font-semibold text-rust hover:underline">Remove</button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

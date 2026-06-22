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
import PageHeader from "@/components/admin/ui/PageHeader.js";
import Card from "@/components/admin/ui/Card.js";
import Button from "@/components/admin/ui/Button.js";

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
      <PageHeader
        title="Gallery"
        subtitle="Photos shown on the public Gallery page. Tags become the filter chips visitors use to narrow the wall."
      />

      <Card pad="md">
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
          <Button type="submit" className="w-fit">Add photo</Button>
        </form>
      </Card>

      {images.length === 0 ? (
        <Card pad="lg" className="mt-6 py-12 text-center text-ink-muted">No photos yet.</Card>
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
                  <Button type="submit" size="sm">Save</Button>
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

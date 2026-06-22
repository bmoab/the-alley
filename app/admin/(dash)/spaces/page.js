import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { listSpacePhotos, addSpacePhoto, updateSpacePhoto, deleteSpacePhoto } from "@/lib/catalog.js";
import { SPACES } from "@/lib/constants.js";
import Placeholder from "@/components/Placeholder.js";
import ContentImageField from "@/components/ContentImageField.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import Button from "@/components/admin/ui/Button.js";

export const metadata = { title: "Spaces" };

function refresh() {
  revalidatePath("/spaces");
  revalidatePath("/");
  revalidatePath("/admin/spaces");
}

async function addPhoto(formData) {
  "use server";
  const space = (formData.get("space") || "").toString();
  const path = (formData.get("image_path") || "").toString().trim();
  if (space && path) {
    addSpacePhoto(space, path, (formData.get("caption") || "").toString().trim() || null, formData.get("sort_order"));
  }
  refresh();
  redirect("/admin/spaces#" + space);
}

async function savePhoto(formData) {
  "use server";
  updateSpacePhoto(Number(formData.get("id")), {
    caption: (formData.get("caption") || "").toString().trim() || null,
    sort_order: formData.get("sort_order"),
  });
  refresh();
  redirect("/admin/spaces#" + formData.get("space"));
}

async function removePhoto(formData) {
  "use server";
  deleteSpacePhoto(Number(formData.get("id")));
  refresh();
  redirect("/admin/spaces#" + formData.get("space"));
}

export default function SpacesAdminPage() {
  return (
    <div>
      <PageHeader
        title="Spaces"
        subtitle="Upload photos of each rentable space. The first photo (lowest order) is the lead image; the rest fill the thumbnail gallery on the public Spaces page."
      />

      {SPACES.map((space) => {
        const photos = listSpacePhotos(space.id);
        return (
          <section key={space.id} id={space.id} className="mt-8 first:mt-0">
            <h2 className="text-xl font-semibold text-ink">
              {space.name} <span className="text-sm font-normal text-ink-muted">{space.location}</span>
            </h2>

            {photos.length === 0 ? (
              <p className="mt-2 text-sm text-ink-muted">No photos yet — a styled placeholder shows on the site until you add some.</p>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {photos.map((p, i) => (
                  <div key={p.id} className="card overflow-hidden">
                    <Placeholder src={p.image_path} label={p.caption || "Photo"} seed={i} className="h-28 w-full" rounded="rounded-none" />
                    {i === 0 ? (
                      <div className="bg-verde/60 px-2 py-0.5 text-center text-[11px] font-semibold text-verde-deep">Lead image</div>
                    ) : null}
                    <form action={savePhoto} className="space-y-2 p-2">
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="space" value={space.id} />
                      <input name="caption" defaultValue={p.caption || ""} placeholder="Caption" className="field text-xs" />
                      <div className="flex items-center gap-2">
                        <input name="sort_order" type="number" defaultValue={p.sort_order ?? 0} className="field w-16 text-xs" title="Order" />
                        <Button type="submit" size="sm">Save</Button>
                      </div>
                    </form>
                    <form action={removePhoto} className="px-2 pb-2">
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="space" value={space.id} />
                      <button className="text-xs font-semibold text-rust hover:underline">Remove</button>
                    </form>
                  </div>
                ))}
              </div>
            )}

            <details className="mt-3 card p-5">
              <summary className="cursor-pointer font-semibold text-ink">+ Add a photo to {space.name}</summary>
              <form action={addPhoto} className="mt-4 grid gap-3">
                <input type="hidden" name="space" value={space.id} />
                <ContentImageField name="image_path" label="Photo" hint="Upload a JPG/PNG/WEBP of this space." />
                <div className="flex items-center gap-2">
                  <input name="caption" placeholder="Caption (e.g. set for a workshop)" className="field text-sm" />
                  <input name="sort_order" type="number" defaultValue={photos.length} className="field w-20 text-sm" title="Order" />
                  <Button type="submit" size="sm">Add photo</Button>
                </div>
              </form>
            </details>
          </section>
        );
      })}
    </div>
  );
}

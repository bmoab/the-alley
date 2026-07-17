import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContent, setContent } from "@/lib/db.js";
import ContentImageField from "@/components/ContentImageField.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import Button from "@/components/admin/ui/Button.js";

export const metadata = { title: "Site Photos" };

// Single photos used across the public site (separate from the Gallery and the
// per-space photo sets). A styled placeholder shows until one is uploaded.
// NOTE: the key stays `home_hero_image` (so any photo already uploaded here is
// preserved) even though it now powers the About page's hero banner.
const IMAGE_FIELDS = [
  { key: "home_hero_image", label: "About — hero banner (top of the About page)", hint: "Wide banner shown across the top of the About page, under the headline." },
  { key: "space_loft_image", label: "Spaces — The Loft lead photo (fallback)", hint: "Used if no Loft photos are added under Spaces Photos." },
  { key: "space_main_image", label: "Spaces — Main Floor lead photo (fallback)", hint: "Used if no Main Floor photos are added under Spaces Photos." },
  { key: "about_image", label: "About — story photo (beside the text)", hint: "Square-ish image next to the About story text." },
];

async function save(formData) {
  "use server";
  for (const f of IMAGE_FIELDS) setContent(f.key, (formData.get(f.key) || "").toString());
  revalidatePath("/");
  revalidatePath("/about");
  revalidatePath("/spaces");
  revalidatePath("/admin/site-photos");
  redirect("/admin/site-photos?saved=1");
}

export default function SitePhotosPage() {
  const c = getContent();

  return (
    <div>
      <PageHeader
        eyebrow="Site Content"
        title="Site Photos"
        subtitle="Swap the main photos across your site. These are separate from the Gallery and from each space's photo set (Spaces Photos)."
      />

      <form action={save} className="space-y-5">
        {IMAGE_FIELDS.map((f) => (
          <ContentImageField key={f.key} name={f.key} label={f.label} hint={f.hint} value={c[f.key] || ""} />
        ))}
        <Button type="submit">Save changes</Button>
      </form>
    </div>
  );
}

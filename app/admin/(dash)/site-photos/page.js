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
// `framing` adds the focal-point + "show whole photo" controls; `height` adds
// the banner-height control (the About hero is the only fixed-height banner).
const IMAGE_FIELDS = [
  { key: "home_hero_image", label: "About — hero banner (top of the About page)", hint: "Wide banner across the top of the About page. Click the photo to choose what stays in view.", framing: true, height: true },
  { key: "space_loft_image", label: "Spaces — The Loft lead photo (fallback)", hint: "Used if no Loft photos are added under Spaces Photos." },
  { key: "space_main_image", label: "Spaces — Main Floor lead photo (fallback)", hint: "Used if no Main Floor photos are added under Spaces Photos." },
  { key: "about_image", label: "About — story photo (beside the text)", hint: "Image next to the About story text. Click the photo to choose what stays in view.", framing: true },
];

async function save(formData) {
  "use server";
  for (const f of IMAGE_FIELDS) {
    setContent(f.key, (formData.get(f.key) || "").toString());
    // Companion framing keys: only for fields that expose the controls.
    if (f.framing) {
      setContent(`${f.key}_fit`, (formData.get(`${f.key}_fit`) || "cover").toString());
      setContent(`${f.key}_pos`, (formData.get(`${f.key}_pos`) || "50% 50%").toString());
    }
    if (f.height) setContent(`${f.key}_h`, (formData.get(`${f.key}_h`) || "440").toString());
  }
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
          <ContentImageField
            key={f.key}
            name={f.key}
            label={f.label}
            hint={f.hint}
            value={c[f.key] || ""}
            framing={f.framing}
            height={f.height}
            pos={c[`${f.key}_pos`] || "50% 50%"}
            fit={c[`${f.key}_fit`] || "cover"}
            heightPx={Number(c[`${f.key}_h`]) || 440}
          />
        ))}
        <Button type="submit">Save changes</Button>
      </form>
    </div>
  );
}

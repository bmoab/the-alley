import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContent, setContent } from "@/lib/db.js";
import ContentImageField from "@/components/ContentImageField.js";

export const metadata = { title: "Site Photos" };

// Single photos used across the public site (separate from the Gallery and the
// per-space photo sets). A styled placeholder shows until one is uploaded.
const IMAGE_FIELDS = [
  { key: "home_hero_image", label: "Homepage — main hero photo", hint: "The large image beside the headline on the homepage." },
  { key: "space_loft_image", label: "Spaces — The Loft lead photo (fallback)", hint: "Used if no Loft photos are added under Spaces Photos." },
  { key: "space_main_image", label: "Spaces — Main Floor lead photo (fallback)", hint: "Used if no Main Floor photos are added under Spaces Photos." },
  { key: "about_image", label: "About — photo", hint: "Image on the About page." },
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

export default function SitePhotosPage({ searchParams }) {
  const c = getContent();
  const saved = searchParams?.saved;

  return (
    <div>
      <p className="eyebrow">Site Content</p>
      <h1 className="font-display text-3xl font-semibold text-ink">Site Photos</h1>
      <p className="mt-1 text-ink-muted">
        Swap the main photos across your site. These are separate from the Gallery and from each space&apos;s
        photo set (Spaces Photos).
      </p>

      {saved ? (
        <div className="mt-4 rounded-lg border border-brass/30 bg-brass/10 px-4 py-2 text-sm text-brass-dark">
          Saved. Your site is updated.
        </div>
      ) : null}

      <form action={save} className="mt-6 space-y-5">
        {IMAGE_FIELDS.map((f) => (
          <ContentImageField key={f.key} name={f.key} label={f.label} hint={f.hint} value={c[f.key] || ""} />
        ))}
        <button type="submit" className="btn-primary">Save changes</button>
      </form>
    </div>
  );
}

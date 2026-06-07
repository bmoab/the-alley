import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContent, setContent } from "@/lib/db.js";
import ContentImageField from "@/components/ContentImageField.js";

export const metadata = { title: "Site Content" };

const FIELDS = [
  { key: "home_hero_tagline", label: "Home — hero tagline", textarea: true },
  { key: "home_hero_subtitle", label: "Home — hero subtitle", textarea: true },
  { key: "home_intro", label: "Home — intro paragraph", textarea: true },
  { key: "about_body", label: "About — body (blank line separates paragraphs)", textarea: true, rows: 8 },
  { key: "contact_address", label: "Contact — address" },
  { key: "contact_email", label: "Contact — email" },
  { key: "contact_phone", label: "Contact — phone" },
  { key: "social_instagram", label: "Instagram URL" },
  { key: "social_facebook", label: "Facebook URL" },
];

// Photos shown across the public site. Each is optional — a styled placeholder
// shows until a real image is uploaded. Separate from the Gallery.
const IMAGE_FIELDS = [
  { key: "home_hero_image", label: "Homepage — main hero photo", hint: "The large image beside the headline on the homepage." },
  { key: "space_loft_image", label: "Homepage/Spaces — The Loft photo", hint: "Shown on the Loft space card." },
  { key: "space_main_image", label: "Homepage/Spaces — Main Floor photo", hint: "Shown on the Main Floor space card." },
  { key: "about_image", label: "About — photo", hint: "Image on the About page." },
];

async function save(formData) {
  "use server";
  for (const f of FIELDS) {
    setContent(f.key, (formData.get(f.key) || "").toString());
  }
  for (const f of IMAGE_FIELDS) {
    setContent(f.key, (formData.get(f.key) || "").toString());
  }
  revalidatePath("/");
  revalidatePath("/about");
  revalidatePath("/spaces");
  revalidatePath("/contact");
  revalidatePath("/admin/content");
  redirect("/admin/content?saved=1");
}

export default function ContentPage({ searchParams }) {
  const c = getContent();
  const saved = searchParams?.saved;

  return (
    <div>
      <p className="eyebrow">Admin</p>
      <h1 className="font-display text-3xl font-semibold text-ink">Site Content</h1>
      <p className="mt-1 text-ink-muted">
        Edit the words on your website. No code required — changes go live
        immediately.
      </p>

      {saved ? (
        <div className="mt-4 rounded-lg border border-brass/30 bg-brass/10 px-4 py-2 text-sm text-brass-dark">
          Saved. Your site is updated.
        </div>
      ) : null}

      <form action={save} className="mt-6 space-y-5">
        {FIELDS.map((f) => (
          <div key={f.key} className="card p-5">
            <label className="label" htmlFor={f.key}>{f.label}</label>
            {f.textarea ? (
              <textarea
                id={f.key}
                name={f.key}
                rows={f.rows || 3}
                defaultValue={c[f.key] || ""}
                className="field"
              />
            ) : (
              <input
                id={f.key}
                name={f.key}
                defaultValue={c[f.key] || ""}
                className="field"
              />
            )}
          </div>
        ))}

        <h2 className="pt-4 font-display text-2xl font-semibold text-ink">
          Site photos
        </h2>
        <p className="-mt-2 text-sm text-ink-muted">
          Swap the main photos across your site. These are separate from the
          Gallery.
        </p>
        {IMAGE_FIELDS.map((f) => (
          <ContentImageField
            key={f.key}
            name={f.key}
            label={f.label}
            hint={f.hint}
            value={c[f.key] || ""}
          />
        ))}

        <button type="submit" className="btn-primary">Save changes</button>
      </form>
    </div>
  );
}

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContent, setContent } from "@/lib/db.js";

export const metadata = { title: "Site Content" };

const FIELDS = [
  { key: "home_hero_tagline", label: "Home — hero tagline", textarea: true },
  { key: "home_hero_subtitle", label: "Home — hero subtitle", textarea: true },
  { key: "home_intro", label: "Home — intro paragraph", textarea: true },
  { key: "about_body", label: "About — body (blank line separates paragraphs)", textarea: true, rows: 8 },
  { key: "contact_address", label: "Contact — address" },
  { key: "contact_email", label: "Contact — email" },
  { key: "contact_phone", label: "Contact — phone" },
];

async function save(formData) {
  "use server";
  for (const f of FIELDS) {
    setContent(f.key, (formData.get(f.key) || "").toString());
  }
  revalidatePath("/");
  revalidatePath("/about");
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
        <button type="submit" className="btn-primary">Save changes</button>
      </form>
    </div>
  );
}

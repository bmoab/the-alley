import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContent, setContent } from "@/lib/db.js";
import ContentImageField from "@/components/ContentImageField.js";

export const metadata = { title: "Site Content" };

const FIELDS = [
  { key: "home_hero_eyebrow", label: "Home — hero eyebrow", },
  { key: "home_hero_lede", label: "Home — hero lede paragraph", textarea: true },
  { key: "home_hero_tagline", label: "Home — hero tagline", textarea: true },
  { key: "home_intro", label: "Home — intro paragraph", textarea: true },
  { key: "home_cta_heading", label: "Home — CTA heading" },
  { key: "home_cta_subtitle", label: "Home — CTA subtitle" },
  { key: "about_body", label: "About — body (blank line separates paragraphs)", textarea: true, rows: 8 },
  { key: "contact_address", label: "Contact — address" },
  { key: "contact_email", label: "Contact — email" },
  { key: "contact_phone", label: "Contact — phone" },
  { key: "social_instagram", label: "Instagram URL" },
  { key: "social_facebook", label: "Facebook URL" },
];

// Structured copy stored as JSON. Edited here as raw JSON (validated on save);
// richer per-item editors can come later.
const JSON_FIELDS = [
  {
    key: "home_hero_rotate",
    label: "Home — rotating hero words (JSON array of strings)",
    rows: 2,
    placeholder: '["MUSIC", "ART", "EVENTS", "COMMUNITY"]',
  },
  {
    key: "home_destinations",
    label: "Home — “what you'll find here” cards (JSON array of {title, blurb, href})",
    rows: 6,
  },
  {
    key: "about_founders",
    label: "About — founders (JSON array of {name, role, bio})",
    rows: 8,
  },
  {
    key: "about_pillars",
    label: "About — pillars (JSON array of strings)",
    rows: 5,
  },
  {
    key: "art_beat",
    label: "Art Beat — festival (JSON: {date, intro, ways: [[title, desc], …]})",
    rows: 8,
  },
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
  // JSON blocks: only persist values that parse, so a typo can't blank the site.
  const badKeys = [];
  for (const f of JSON_FIELDS) {
    const raw = (formData.get(f.key) || "").toString().trim();
    if (!raw) continue;
    try {
      JSON.parse(raw);
      setContent(f.key, raw);
    } catch {
      badKeys.push(f.key);
    }
  }
  revalidatePath("/");
  revalidatePath("/about");
  revalidatePath("/spaces");
  revalidatePath("/contact");
  revalidatePath("/art-beat");
  revalidatePath("/admin/content");
  redirect("/admin/content?saved=1" + (badKeys.length ? "&invalid=" + encodeURIComponent(badKeys.join(",")) : ""));
}

function prettyJson(value) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value || "";
  }
}

export default function ContentPage({ searchParams }) {
  const c = getContent();
  const saved = searchParams?.saved;
  const invalid = searchParams?.invalid;

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
      {invalid ? (
        <div className="mt-2 rounded-lg border border-rust/30 bg-rust/10 px-4 py-2 text-sm text-rust">
          Some JSON fields weren&apos;t valid and were left unchanged: {invalid}. Check the formatting and save again.
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
          Page copy (structured)
        </h2>
        <p className="-mt-2 text-sm text-ink-muted">
          These sections are stored as JSON. Keep the shape shown in the
          placeholder; invalid JSON is ignored on save so the site can&apos;t break.
        </p>
        {JSON_FIELDS.map((f) => (
          <div key={f.key} className="card p-5">
            <label className="label" htmlFor={f.key}>{f.label}</label>
            <textarea
              id={f.key}
              name={f.key}
              rows={f.rows || 5}
              defaultValue={prettyJson(c[f.key] || "")}
              placeholder={f.placeholder}
              className="field font-mono text-xs"
              spellCheck={false}
            />
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

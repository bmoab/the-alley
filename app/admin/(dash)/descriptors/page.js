import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContent, setContent } from "@/lib/db.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import Card from "@/components/admin/ui/Card.js";
import Button from "@/components/admin/ui/Button.js";

export const metadata = { title: "Descriptors" };

const FIELDS = [
  { key: "home_hero_eyebrow", label: "Home — hero eyebrow" },
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
  { key: "calendar_share_url", label: "Shared calendar link (Google Calendar) — included in tenant/host/exhibitor invites" },
];

const JSON_FIELDS = [
  { key: "home_hero_rotate", label: "Home — rotating hero words (JSON array of strings)", rows: 2, placeholder: '["MUSIC", "ART", "EVENTS", "COMMUNITY"]' },
  { key: "home_destinations", label: "Home — “what you'll find here” cards (JSON array of {title, blurb, href})", rows: 6 },
  { key: "about_founders", label: "About — founders (JSON array of {name, role, bio})", rows: 8 },
  { key: "about_pillars", label: "About — pillars (JSON array of strings)", rows: 5 },
  { key: "art_beat", label: "Art Beat — festival (JSON: {date, intro, ways: [[title, desc], …]})", rows: 8 },
];

async function save(formData) {
  "use server";
  for (const f of FIELDS) setContent(f.key, (formData.get(f.key) || "").toString());
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
  revalidatePath("/contact");
  revalidatePath("/art-beat");
  revalidatePath("/spaces");
  revalidatePath("/admin/descriptors");
  if (badKeys.length) {
    redirect(
      "/admin/descriptors?toast=" +
        encodeURIComponent(
          `Saved, but some JSON fields were invalid and left unchanged: ${badKeys.join(", ")}.`
        ) +
        "&toastType=error"
    );
  }
  redirect("/admin/descriptors?saved=1");
}

function prettyJson(value) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value || "";
  }
}

export default function DescriptorsPage() {
  const c = getContent();

  return (
    <div>
      <PageHeader
        eyebrow="Site Content"
        title="Descriptors"
        subtitle="Edit the words on your website. Changes go live immediately."
      />

      <form action={save} className="space-y-5">
        {FIELDS.map((f) => (
          <Card key={f.key} pad="md">
            <label className="label" htmlFor={f.key}>{f.label}</label>
            {f.textarea ? (
              <textarea id={f.key} name={f.key} rows={f.rows || 3} defaultValue={c[f.key] || ""} className="field" />
            ) : (
              <input id={f.key} name={f.key} defaultValue={c[f.key] || ""} className="field" />
            )}
          </Card>
        ))}

        <h2 className="pt-4 text-xl font-semibold text-ink">Page copy (structured)</h2>
        <p className="-mt-2 text-sm text-ink-muted">
          These sections are stored as JSON. Keep the shape shown in the placeholder; invalid JSON is ignored on
          save so the site can&apos;t break.
        </p>
        {JSON_FIELDS.map((f) => (
          <Card key={f.key} pad="md">
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
          </Card>
        ))}

        <Button type="submit">Save changes</Button>
      </form>
    </div>
  );
}

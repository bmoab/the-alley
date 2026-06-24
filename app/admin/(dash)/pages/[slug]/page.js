import { revalidatePath } from "next/cache";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getContent, setContent } from "@/lib/db.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import Card from "@/components/admin/ui/Card.js";
import Button from "@/components/admin/ui/Button.js";
import ContentImageField from "@/components/ContentImageField.js";
import { cx } from "@/components/admin/ui/cx.js";

/**
 * Visual "Pages" editor: pick a page, edit its fields on the left, see a live
 * preview of the real public page on the right. Save → the route is revalidated
 * and the preview iframe reloads (via a cache-busting `?_=<saved>`). Reuses the
 * Descriptors field/JSON pattern + ContentImageField + setContent.
 */

// Field metadata (labels/shape) — same wording as the Descriptors page.
const TEXT = {
  home_hero_eyebrow: { label: "Hero eyebrow" },
  home_hero_lede: { label: "Hero lede paragraph", textarea: true, rows: 3 },
  home_cta_heading: { label: "CTA heading" },
  home_cta_subtitle: { label: "CTA subtitle" },
  about_body: { label: "Body (a blank line separates paragraphs)", textarea: true, rows: 8 },
  contact_address: { label: "Address" },
  contact_email: { label: "Email" },
  contact_phone: { label: "Phone" },
  social_instagram: { label: "Instagram URL" },
};
const JSON_F = {
  home_hero_rotate: { label: "Rotating hero words (JSON array of strings)", rows: 2, placeholder: '["MUSIC", "ART", "EVENTS", "COMMUNITY"]' },
  home_destinations: { label: "“What you'll find here” cards (JSON [{title, blurb, href}])", rows: 6 },
  about_founders: { label: "Founders (JSON [{name, role, bio}])", rows: 8 },
  about_pillars: { label: "Pillars (JSON array of strings)", rows: 5 },
  art_beat: { label: "Art Beat festival (JSON {date, intro, ways: [[title, desc], …]})", rows: 8 },
};
const IMG = {
  home_hero_image: { label: "Hero photo", hint: "Main image on the homepage hero." },
  about_image: { label: "About photo", hint: "Image on the About page." },
};

const PAGES = {
  home: {
    label: "Home", route: "/",
    text: ["home_hero_eyebrow", "home_hero_lede", "home_cta_heading", "home_cta_subtitle", "social_instagram"],
    json: ["home_hero_rotate", "home_destinations"],
    image: ["home_hero_image"],
    note: "Space lead photos are managed under Site Content → Spaces Photos.",
  },
  about: {
    label: "About", route: "/about",
    text: ["about_body"],
    json: ["about_founders", "about_pillars"],
    image: ["about_image"],
  },
  contact: {
    label: "Contact", route: "/contact",
    text: ["contact_address", "contact_email", "contact_phone", "social_instagram"],
    json: [],
    image: [],
  },
  "art-beat": {
    label: "Art Beat", route: "/art-beat",
    text: [],
    json: ["art_beat"],
    image: [],
  },
};
const SLUGS = Object.keys(PAGES);

function prettyJson(value) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value || "";
  }
}

export function generateMetadata({ params }) {
  const p = PAGES[params.slug];
  return { title: p ? `Edit · ${p.label}` : "Pages" };
}

async function save(formData) {
  "use server";
  const slug = (formData.get("__slug") || "").toString();
  const page = PAGES[slug];
  if (!page) redirect("/admin/pages/home");

  // Text + image keys: persist whatever was submitted (allows clearing).
  for (const key of [...page.text, ...page.image]) {
    setContent(key, (formData.get(key) || "").toString());
  }
  // JSON keys: validate; skip empties (don't wipe) and skip invalid (don't break the site).
  const bad = [];
  for (const key of page.json) {
    const raw = (formData.get(key) || "").toString().trim();
    if (!raw) continue;
    try {
      JSON.parse(raw);
      setContent(key, raw);
    } catch {
      bad.push(key);
    }
  }

  revalidatePath(page.route);
  revalidatePath(`/admin/pages/${slug}`);
  const base = `/admin/pages/${slug}?saved=${Date.now()}`;
  if (bad.length) {
    redirect(
      base +
        "&toast=" +
        encodeURIComponent(`Saved, but invalid JSON was left unchanged: ${bad.join(", ")}.`) +
        "&toastType=error"
    );
  }
  redirect(base);
}

export default function PageEditor({ params, searchParams }) {
  const slug = params.slug;
  const page = PAGES[slug];
  if (!page) notFound();

  const c = getContent();
  const saved = (searchParams?.saved || "0").toString();
  const previewSrc = `${page.route}${page.route.includes("?") ? "&" : "?"}_=${saved}`;

  return (
    <div>
      <PageHeader
        eyebrow="Site Content"
        title="Pages"
        subtitle="Edit a page's words and photos with a live preview of the real page beside it. Save to update both."
      />

      {/* Page switcher */}
      <div className="mb-5 flex flex-wrap items-center gap-1 rounded-full border border-line bg-paper p-1">
        {SLUGS.map((s) => (
          <Link
            key={s}
            href={`/admin/pages/${s}`}
            className={cx(
              "rounded-full px-4 py-1.5 text-sm font-semibold transition",
              s === slug ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper-dim hover:text-ink"
            )}
          >
            {PAGES[s].label}
          </Link>
        ))}
        <a
          href={page.route}
          target="_blank"
          rel="noreferrer"
          className="ml-auto whitespace-nowrap px-4 py-1.5 text-sm font-medium text-verde-deep hover:underline"
        >
          Open page ↗
        </a>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left — fields */}
        <form action={save} className="space-y-4">
          <input type="hidden" name="__slug" value={slug} />

          {page.text.map((key) => {
            const f = TEXT[key];
            return (
              <Card key={key} pad="md">
                <label className="label" htmlFor={key}>{f.label}</label>
                {f.textarea ? (
                  <textarea id={key} name={key} rows={f.rows || 3} defaultValue={c[key] || ""} className="field" />
                ) : (
                  <input id={key} name={key} defaultValue={c[key] || ""} className="field" />
                )}
              </Card>
            );
          })}

          {/* Image fields are self-contained cards (ContentImageField). */}
          {page.image.map((key) => {
            const f = IMG[key];
            return <ContentImageField key={key} name={key} label={f.label} hint={f.hint} value={c[key] || ""} />;
          })}

          {page.json.length ? (
            <>
              <p className="px-1 text-xs text-ink-muted">
                Structured sections (JSON — keep the shape shown; invalid JSON is ignored on save so the site can&apos;t break).
              </p>
              {page.json.map((key) => {
                const f = JSON_F[key];
                return (
                  <Card key={key} pad="md">
                    <label className="label" htmlFor={key}>{f.label}</label>
                    <textarea
                      id={key}
                      name={key}
                      rows={f.rows || 5}
                      defaultValue={prettyJson(c[key] || "")}
                      placeholder={f.placeholder}
                      className="field font-mono text-xs"
                      spellCheck={false}
                    />
                  </Card>
                );
              })}
            </>
          ) : null}

          {page.note ? <p className="px-1 text-xs text-ink-muted">{page.note}</p> : null}

          <Button type="submit">Save changes</Button>
        </form>

        {/* Right — live preview */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
              Live preview · {page.route}
            </span>
          </div>
          <div className="h-[60vh] overflow-hidden rounded-xl border border-line bg-paper lg:h-[calc(100vh-9rem)]">
            <iframe
              key={previewSrc}
              src={previewSrc}
              title={`Preview of ${page.label}`}
              className="h-full w-full"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

import { revalidatePath } from "next/cache";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getContent, setContent } from "@/lib/db.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import PagesEditor from "@/components/admin/PagesEditor.js";
import { cx } from "@/components/admin/ui/cx.js";

/**
 * Visual "Pages" editor: pick a page, edit its words/photos/lists on the left,
 * see a preview of the real public page on the right (refreshes on Save).
 * The PAGES manifest only surfaces fields each page actually renders.
 */

// Plain text fields (label + optional textarea).
const TEXT = {
  home_hero_eyebrow: { label: "Hero eyebrow" },
  home_hero_lede: { label: "Hero lede paragraph", textarea: true, rows: 3 },
  home_cta_heading: { label: "CTA heading" },
  home_cta_subtitle: { label: "CTA subtitle" },
  social_instagram: { label: "Instagram URL" },
  social_facebook: { label: "Facebook URL" },
  about_hero_eyebrow: { label: "Hero eyebrow" },
  about_hero_title: { label: "Hero title" },
  about_body: { label: "Body (a blank line separates paragraphs)", textarea: true, rows: 8 },
  contact_hero_eyebrow: { label: "Hero eyebrow" },
  contact_hero_title: { label: "Hero title" },
  contact_hero_lede: { label: "Hero intro", textarea: true, rows: 3 },
  contact_address: { label: "Address" },
  contact_email: { label: "Email" },
  contact_phone: { label: "Phone" },
  gallery_hero_subtitle: { label: "Eyebrow (small label above the title)" },
  gallery_hero_title: { label: "Title" },
  gallery_hero_lede: { label: "Intro paragraph", textarea: true, rows: 3 },
  spaces_hero_eyebrow: { label: "Hero eyebrow" },
  spaces_hero_title: { label: "Hero title" },
  spaces_hero_lede: { label: "Hero intro", textarea: true, rows: 3 },
  spaces_book_heading: { label: "“Before you book” heading" },
  spaces_book_body: { label: "“Before you book” text — type {deposit} to show the live deposit amount", textarea: true, rows: 4 },
  directory_hero_eyebrow: { label: "Hero eyebrow" },
  directory_hero_title: { label: "Hero title" },
  directory_hero_lede: { label: "Hero intro", textarea: true, rows: 3 },
  directory_list_heading: { label: "List section heading" },
  directory_list_subhead: { label: "List section subheading" },
  directory_leasing_blurb: { label: "Leasing blurb", textarea: true, rows: 3 },
  exhibitors_hero_eyebrow: { label: "Hero eyebrow" },
  exhibitors_hero_title: { label: "Hero title" },
  exhibitors_hero_lede: { label: "Hero intro", textarea: true, rows: 3 },
  exhibitors_cta_heading: { label: "“Want to show your work?” heading" },
  exhibitors_cta_blurb: { label: "“Want to show your work?” text", textarea: true, rows: 3 },
  calendar_hero_eyebrow: { label: "Hero eyebrow" },
  calendar_hero_title: { label: "Hero title" },
  calendar_hero_lede: { label: "Hero intro", textarea: true, rows: 3 },
};

// Image fields (ContentImageField).
const IMG = {
  about_image: { label: "About photo", hint: "Image on the About page." },
};

// Structured list / composite fields.
const LIST = {
  home_hero_rotate: {
    type: "list", label: "Rotating hero words",
    schema: { kind: "strings", addLabel: "Add word", itemLabel: "Word", placeholder: "MUSIC" },
  },
  home_destinations: {
    type: "list", label: "“What you'll find here” cards",
    schema: {
      kind: "objects", addLabel: "Add card",
      fields: [
        { key: "title", label: "Title", placeholder: "Spaces" },
        { key: "blurb", label: "Blurb", placeholder: "Host your gathering" },
        { key: "href", label: "Link", placeholder: "/spaces" },
      ],
    },
  },
  about_founders: {
    type: "list", label: "Founders",
    schema: {
      kind: "objects", addLabel: "Add founder",
      fields: [
        { key: "name", label: "Name", placeholder: "Chelsea Funk" },
        { key: "role", label: "Role", placeholder: "Co-Founder" },
        { key: "bio", label: "Bio", textarea: true },
      ],
    },
  },
  about_pillars: {
    type: "list", label: "Pillars",
    schema: { kind: "strings", addLabel: "Add pillar", itemLabel: "Pillar", placeholder: "Community Over Competition" },
  },
  art_beat: { type: "artbeat", label: "Art Beat festival" },
};

const PAGES = {
  home: {
    label: "Home", route: "/",
    text: ["home_hero_eyebrow", "home_hero_lede", "home_cta_heading", "home_cta_subtitle", "social_instagram"],
    list: ["home_hero_rotate", "home_destinations"],
    image: [],
  },
  about: {
    label: "About", route: "/about",
    text: ["about_hero_eyebrow", "about_hero_title", "about_body"],
    list: ["about_founders", "about_pillars"],
    image: ["about_image"],
  },
  contact: {
    label: "Contact", route: "/contact",
    text: ["contact_hero_eyebrow", "contact_hero_title", "contact_hero_lede", "contact_address", "contact_email", "contact_phone", "social_instagram", "social_facebook"],
    list: [], image: [],
  },
  "art-beat": {
    label: "Art Beat", route: "/art-beat",
    text: [], list: ["art_beat"], image: [],
  },
  gallery: {
    label: "Gallery", route: "/gallery",
    text: ["gallery_hero_subtitle", "gallery_hero_title", "gallery_hero_lede"],
    list: [], image: [],
    note: "Gallery photos are managed under Site Content → Gallery.",
  },
  spaces: {
    label: "Spaces", route: "/spaces",
    text: ["spaces_hero_eyebrow", "spaces_hero_title", "spaces_hero_lede", "spaces_book_heading", "spaces_book_body"],
    list: [], image: [],
    note: "Room photos are managed under Site Content → Spaces Photos.",
  },
  directory: {
    label: "Directory", route: "/directory",
    text: ["directory_hero_eyebrow", "directory_hero_title", "directory_hero_lede", "directory_list_heading", "directory_list_subhead", "directory_leasing_blurb"],
    list: [], image: [],
    note: "Businesses are managed under Site Content → Directory.",
  },
  exhibitors: {
    label: "Exhibitors", route: "/exhibitors",
    text: ["exhibitors_hero_eyebrow", "exhibitors_hero_title", "exhibitors_hero_lede", "exhibitors_cta_heading", "exhibitors_cta_blurb"],
    list: [], image: [],
    note: "Exhibitors are managed under Site Content → Exhibitors.",
  },
  calendar: {
    label: "Calendar", route: "/calendar",
    text: ["calendar_hero_eyebrow", "calendar_hero_title", "calendar_hero_lede"],
    list: [], image: [],
    note: "Events come from hosts and the bookings calendar.",
  },
};
const SLUGS = Object.keys(PAGES);

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
  // List keys arrive as JSON from the structured editors (always valid); still
  // validate defensively and skip anything malformed rather than break the site.
  const bad = [];
  for (const key of page.list) {
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
    redirect(base + "&toast=" + encodeURIComponent(`Couldn't save: ${bad.join(", ")}.`) + "&toastType=error");
  }
  redirect(base);
}

export default function PageEditor({ params, searchParams }) {
  const slug = params.slug;
  const page = PAGES[slug];
  if (!page) notFound();

  const c = getContent();
  const saved = (searchParams?.saved || "0").toString();

  // Build serializable field config + the subset of values this page needs.
  const fields = {
    text: page.text.map((key) => ({ key, ...TEXT[key] })),
    image: page.image.map((key) => ({ key, ...IMG[key] })),
    list: page.list.map((key) => ({ key, ...LIST[key] })),
  };
  const keys = [...page.text, ...page.image, ...page.list];
  const values = Object.fromEntries(keys.map((k) => [k, c[k] || ""]));

  return (
    <div>
      <PageHeader
        eyebrow="Site Content"
        title="Pages"
        subtitle="Edit a page's words and photos with a preview of the real page beside it. Save to update both."
      />

      {/* Page switcher */}
      <div className="mb-5 flex flex-wrap items-center gap-1 rounded-2xl border border-line bg-paper p-1">
        {SLUGS.map((s) => (
          <Link
            key={s}
            href={`/admin/pages/${s}`}
            className={cx(
              "rounded-xl px-3.5 py-1.5 text-sm font-semibold transition",
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
          className="ml-auto whitespace-nowrap px-3.5 py-1.5 text-sm font-medium text-verde-deep hover:underline"
        >
          Open page ↗
        </a>
      </div>

      <PagesEditor
        slug={slug}
        route={page.route}
        label={page.label}
        fields={fields}
        values={values}
        saved={saved}
        note={page.note || null}
        save={save}
      />
    </div>
  );
}

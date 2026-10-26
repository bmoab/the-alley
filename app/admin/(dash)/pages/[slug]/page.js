import { revalidatePath } from "next/cache";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getContent, setContent } from "@/lib/db.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import PagesEditor from "@/components/admin/PagesEditor.js";
import { cx } from "@/components/admin/ui/cx.js";
import { requireAdmin } from "@/lib/auth.js";
import { SPACES } from "@/lib/constants.js";
import { listSpacePhotos, setSpacePhotos, spacePhotosKey } from "@/lib/catalog.js";

/**
 * Visual "Pages" editor: pick a page, edit its words/photos/lists on the left,
 * see the real public page on the right — with your unsaved edits in it, at
 * desktop, tablet or phone size. Nothing goes live until Save.
 * The PAGES manifest only surfaces fields each page actually renders. Every
 * site photo is edited here, on the page it appears on (Site Photos is gone).
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
  spaces_listing_heading: { label: "“Public calendar listing” heading" },
  spaces_listing_body: { label: "“Public calendar listing” text — what hosts get on our calendar", textarea: true, rows: 5 },
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

// Photo fields. kind: "crop" = drag a box over the photo (its shape sets the
// banner's height; also saves `${key}_crop`); "framing" = crop it, or pick what
// stays in view (saves `${key}_fit` + `${key}_pos` + `${key}_crop`); "plain" = just the photo.
const IMG = {
  home_hero_image: {
    label: "Hero banner photo (above the headline)",
    hint: "Wide banner across the top of the homepage. Use “Adjust crop” to frame exactly what shows.",
    kind: "crop",
  },
  about_image: { label: "Story photo (beside the text)", hint: "Crop it, or click or drag on the photo to choose what stays in view.", kind: "framing" },
};
const IMG_EXTRA = { crop: ["_crop"], framing: ["_fit", "_pos", "_crop"] };

// Photo galleries: each room's photos (the space_photos table, not page text).
// Posted as JSON [{ path, caption }]; the first is the room's main photo.
const GALLERY = Object.fromEntries(
  SPACES.map((s) => [spacePhotosKey(s.id), { label: `${s.name} photos`, space: s.id }])
);
const imageKeys = (key) => [key, ...IMG_EXTRA[IMG[key].kind].map((s) => key + s)];

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
        { key: "photo", label: "Photo", type: "image" },
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
    image: ["home_hero_image"],
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
    text: ["spaces_hero_eyebrow", "spaces_hero_title", "spaces_hero_lede", "spaces_listing_heading", "spaces_listing_body", "spaces_book_heading", "spaces_book_body"],
    list: [], image: [], gallery: SPACES.map((s) => spacePhotosKey(s.id)),
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
  await requireAdmin();
  const slug = (formData.get("__slug") || "").toString();
  const page = PAGES[slug];
  if (!page) redirect("/admin/pages/home");

  // Text + image keys (and each photo's crop/framing): persist whatever was
  // submitted (allows clearing).
  for (const key of [...page.text, ...page.image.flatMap(imageKeys)]) {
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

  // Room photos go to their own table, in the order shown.
  for (const key of page.gallery || []) {
    const raw = formData.get(key);
    if (raw == null) continue;
    try {
      const photos = JSON.parse(raw.toString());
      if (Array.isArray(photos)) setSpacePhotos(GALLERY[key].space, photos);
      else bad.push(GALLERY[key].label);
    } catch {
      bad.push(GALLERY[key].label);
    }
  }
  if (page.gallery?.length) revalidatePath("/");

  revalidatePath(page.route);
  revalidatePath(`/admin/pages/${slug}`);
  const base = `/admin/pages/${slug}?saved=${Date.now()}`;
  if (bad.length) {
    redirect(base + "&toast=" + encodeURIComponent(`Couldn't save: ${bad.join(", ")}.`) + "&toastType=error");
  }
  redirect(base);
}

export default async function PageEditor({ params, searchParams }) {
  await requireAdmin();
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
    gallery: (page.gallery || []).map((key) => ({ key, label: GALLERY[key].label })),
  };
  const keys = [...page.text, ...page.image.flatMap(imageKeys), ...page.list];
  const values = Object.fromEntries(keys.map((k) => [k, c[k] || ""]));
  for (const key of page.gallery || []) {
    values[key] = JSON.stringify(
      listSpacePhotos(GALLERY[key].space).map((p) => ({ path: p.image_path, caption: p.caption || "", crop: p.crop || "" }))
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Site Content"
        title="Pages"
        subtitle="Edit a page's words and photos and see them in the real page beside it, at desktop, tablet or phone size. Nothing goes live until you Save."
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

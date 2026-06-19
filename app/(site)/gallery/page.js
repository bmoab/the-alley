import { listGallery, listGalleryTags } from "@/lib/catalog.js";
import PageHero from "@/components/site/PageHero.js";
import GalleryHall from "@/components/GalleryHall.js";

export const metadata = { title: "The Gallery" };

// Stable rotation of frame shapes + duotone tints so the salon wall reads as
// varied even before the owner uploads real photos.
const ARS = ["3 / 4", "4 / 5", "1 / 1", "4 / 3", "5 / 4"];
const VARIANTS = ["", "verde", "soft"];

export default function GalleryPage() {
  const rows = listGallery();
  const tags = listGalleryTags();

  const photos = rows.map((r, i) => ({
    id: r.id,
    cap: r.caption || "The Alley",
    tags: r.tagList,
    src: r.image_path || null,
    ar: ARS[i % ARS.length],
    variant: VARIANTS[i % VARIANTS.length],
  }));

  return (
    <main>
      <PageHero
        eyebrow="The heart of The Alley"
        title="The Gallery"
        lede="Photos of the space, the building, and our events — openings, markets, live music, and the everyday life of the building."
        kicker="Wander the room. The light follows you, and every picture opens to fill the wall. New photos go up as they happen."
      />
      <GalleryHall
        title="The Alley, in pictures"
        subtitle="Photo gallery · The space, the building & our events"
        note="Moments from around the building — openings, markets, live music, and quiet golden-hour afternoons. Filter by what you're looking for, and select any photo to step closer."
        photos={photos}
        tags={tags}
      />
    </main>
  );
}

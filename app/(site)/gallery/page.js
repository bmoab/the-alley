import { listGallery, listGalleryTags } from "@/lib/catalog.js";
import { getContentValue } from "@/lib/db.js";
import GalleryHall from "@/components/GalleryHall.js";

export const metadata = { title: "The Gallery" };

export default function GalleryPage() {
  const rows = listGallery();
  const tags = listGalleryTags();

  const photos = rows.map((r) => ({
    id: r.id,
    cap: r.caption || "The Alley",
    tags: r.tagList,
    src: r.image_path || null,
  }));

  return (
    <main>
      <GalleryHall
        subtitle={getContentValue("gallery_hero_subtitle", "The Alley · Gallery")}
        title={getContentValue("gallery_hero_title", "A room is a canvas before it's a memory")}
        lede={getContentValue(
          "gallery_hero_lede",
          "The spaces, the makers, and the gatherings that fill The Alley on Center — openings, markets, live music, and the everyday life of the building."
        )}
        editKeys={{ subtitle: "gallery_hero_subtitle", title: "gallery_hero_title", lede: "gallery_hero_lede" }}
        photos={photos}
        tags={tags}
      />
    </main>
  );
}

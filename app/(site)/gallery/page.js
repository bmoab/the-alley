import { listGallery, listGalleryTags } from "@/lib/catalog.js";
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
        subtitle="The Alley · Gallery"
        title="A room is a canvas before it's a memory"
        lede="The spaces, the makers, and the gatherings that fill The Alley on Center — openings, markets, live music, and the everyday life of the building."
        photos={photos}
        tags={tags}
      />
    </main>
  );
}

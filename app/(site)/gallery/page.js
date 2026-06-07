import { listGallery } from "@/lib/catalog.js";
import Placeholder from "@/components/Placeholder.js";

export const metadata = { title: "The Alley Gallery" };

export default function GalleryPage() {
  const images = listGallery();

  return (
    <main className="container-content py-14">
      <p className="eyebrow">The heart of The Alley</p>
      <h1 className="mt-2 font-display text-4xl font-semibold text-ink">The Alley Gallery</h1>
      <p className="mt-3 max-w-2xl text-lg text-ink-muted">
        A shared space for art, connection, and community. Part welcoming lobby,
        part rotating gallery, it showcases local artists and makers while
        staying open to markets, classes, and creative gatherings.
      </p>
      <p className="mt-4 max-w-2xl border-l-2 border-brass pl-4 font-display text-lg italic text-ink">
        Art can look like anything: visual work, objects, movement, sound, words,
        craft, or ideas that don&apos;t fit neatly into a box. Here, art belongs
        to everyone.
      </p>

      {images.length === 0 ? (
        <div className="mt-10 card p-10 text-center text-ink-muted">
          Photos are on the way.
        </div>
      ) : (
        <div className="mt-10 columns-1 gap-4 sm:columns-2 lg:columns-3 [&>*]:mb-4">
          {images.map((img, i) => (
            <figure key={img.id} className="break-inside-avoid">
              <Placeholder
                src={img.image_path}
                label={img.caption || "The Alley"}
                seed={i}
                className={`w-full ${i % 3 === 0 ? "h-72" : "h-52"}`}
              />
              {img.caption ? (
                <figcaption className="mt-1.5 text-xs text-ink-muted">
                  {img.caption}
                </figcaption>
              ) : null}
            </figure>
          ))}
        </div>
      )}
    </main>
  );
}

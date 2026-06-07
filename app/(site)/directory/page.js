import { listDirectory } from "@/lib/catalog.js";
import Placeholder from "@/components/Placeholder.js";

export const metadata = { title: "Directory" };

export default function DirectoryPage() {
  const entries = listDirectory();

  return (
    <main className="container-content py-14">
      <p className="eyebrow">The makers</p>
      <h1 className="mt-2 font-display text-4xl font-semibold text-ink">Directory</h1>
      <p className="mt-3 max-w-2xl text-lg text-ink-muted">
        Independent shops and practitioners who call The Alley home — clothing,
        cuts, ink, healing, and more, all under one roof.
      </p>

      {entries.length === 0 ? (
        <div className="mt-10 card p-10 text-center text-ink-muted">
          Our directory is being assembled. Check back soon.
        </div>
      ) : (
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((e, i) => (
            <div key={e.id} className="card overflow-hidden">
              <Placeholder
                src={e.photo_path}
                label={e.business_name}
                seed={i}
                className="h-40 w-full"
                rounded="rounded-none"
              />
              <div className="p-5">
                {e.category ? (
                  <div className="text-xs font-semibold uppercase tracking-wider text-brass-dark">
                    {e.category}
                  </div>
                ) : null}
                <h2 className="mt-1 font-display text-xl font-semibold text-ink">
                  {e.business_name}
                </h2>
                {e.description ? (
                  <p className="mt-2 text-sm text-ink-muted">{e.description}</p>
                ) : null}
                {e.contact_link ? (
                  <a
                    href={e.contact_link}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-block text-sm font-semibold text-brass-dark hover:underline"
                  >
                    Visit →
                  </a>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

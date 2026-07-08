import Link from "next/link";
import { revalidatePath } from "next/cache";
import {
  getDirectoryByToken,
  saveDirectoryListing,
  parseDirectoryLinks,
  parseDirectoryPhotos,
  directorySlug,
} from "@/lib/catalog.js";
import DirectoryEditForm from "@/components/DirectoryEditForm.js";

export const metadata = { title: "Set up your business listing" };

export default function BusinessListingPage({ params }) {
  const entry = getDirectoryByToken(params.token);

  if (!entry) {
    return (
      <main className="brandpage flex min-h-screen items-center justify-center bg-paper-warm px-5">
        <div className="card max-w-md p-8 text-center">
          <h1 className="font-display text-2xl font-semibold text-ink">
            Link not found
          </h1>
          <p className="mt-3 text-ink-muted">
            This listing link is invalid or has expired. Check your email for the
            correct link, or contact The Alley.
          </p>
          <Link href="/" className="btn-primary mt-6">
            Visit The Alley
          </Link>
        </div>
      </main>
    );
  }

  async function save(data) {
    "use server";
    const saved = saveDirectoryListing(params.token, data);
    revalidatePath("/directory");
    revalidatePath("/admin/directory");
    if (saved) revalidatePath(`/directory/${directorySlug(saved)}`);
    return { ok: true };
  }

  return (
    <main className="brandpage min-h-screen bg-paper-warm">
      <header className="border-b border-ink/10 bg-paper">
        <div className="container-content flex items-center justify-between py-4">
          <Link href="/" className="font-display text-xl font-semibold text-ink">
            The Alley <span className="text-brass-dark">On Center</span>
          </Link>
          <span className="text-sm text-ink-muted">Business listing</span>
        </div>
      </header>

      <div className="container-content max-w-2xl py-10">
        <p className="eyebrow">Your private listing link</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-ink">
          Set up your listing
        </h1>
        <p className="mt-2 text-ink-muted">
          This is your spot in The Alley directory. Add your details, photos, and
          links — your changes go live on our website right away. Bookmark this
          link to edit anytime.
        </p>

        <div className="mt-8">
          <DirectoryEditForm
            entry={{
              ...entry,
              links: parseDirectoryLinks(entry),
              photos: parseDirectoryPhotos(entry),
            }}
            saveAction={save}
          />
        </div>
      </div>
    </main>
  );
}

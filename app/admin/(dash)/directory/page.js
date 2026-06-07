import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  listDirectory,
  createDirectoryEntry,
  updateDirectoryEntry,
  deleteDirectoryEntry,
} from "@/lib/catalog.js";

export const metadata = { title: "Directory" };

function refresh() {
  revalidatePath("/directory");
  revalidatePath("/admin/directory");
}

async function addEntry(formData) {
  "use server";
  createDirectoryEntry({
    business_name: (formData.get("business_name") || "").toString().trim(),
    category: (formData.get("category") || "").toString().trim(),
    description: (formData.get("description") || "").toString().trim(),
    photo_path: (formData.get("photo_path") || "").toString().trim(),
    contact_link: (formData.get("contact_link") || "").toString().trim(),
    sort_order: formData.get("sort_order"),
  });
  refresh();
  redirect("/admin/directory");
}

async function saveEntry(formData) {
  "use server";
  const id = Number(formData.get("id"));
  updateDirectoryEntry(id, {
    business_name: (formData.get("business_name") || "").toString().trim(),
    category: (formData.get("category") || "").toString().trim(),
    description: (formData.get("description") || "").toString().trim(),
    photo_path: (formData.get("photo_path") || "").toString().trim(),
    contact_link: (formData.get("contact_link") || "").toString().trim(),
    sort_order: formData.get("sort_order"),
  });
  refresh();
  redirect("/admin/directory");
}

async function removeEntry(formData) {
  "use server";
  deleteDirectoryEntry(Number(formData.get("id")));
  refresh();
  redirect("/admin/directory");
}

function EntryFields({ entry = {} }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Business name</label>
          <input name="business_name" required defaultValue={entry.business_name || ""} className="field" />
        </div>
        <div>
          <label className="label">Category</label>
          <input name="category" defaultValue={entry.category || ""} placeholder="Salon, Tattoo, Retail…" className="field" />
        </div>
      </div>
      <div className="mt-3">
        <label className="label">Description</label>
        <textarea name="description" rows={2} defaultValue={entry.description || ""} className="field" />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-1">
          <label className="label">Sort order</label>
          <input name="sort_order" type="number" defaultValue={entry.sort_order ?? 0} className="field" />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Contact / social link</label>
          <input name="contact_link" defaultValue={entry.contact_link || ""} placeholder="https://instagram.com/…" className="field" />
        </div>
      </div>
      <div className="mt-3">
        <label className="label">Photo URL or path (optional)</label>
        <input name="photo_path" defaultValue={entry.photo_path || ""} placeholder="/uploads/shop.jpg" className="field" />
      </div>
    </>
  );
}

export default function DirectoryAdminPage() {
  const entries = listDirectory();

  return (
    <div>
      <p className="eyebrow">Admin</p>
      <h1 className="font-display text-3xl font-semibold text-ink">Directory</h1>
      <p className="mt-1 text-ink-muted">
        These businesses appear on the public Directory page, ordered by sort
        order.
      </p>

      {/* Add new */}
      <details className="mt-6 card p-5" open={entries.length === 0}>
        <summary className="cursor-pointer font-semibold text-ink">+ Add a business</summary>
        <form action={addEntry} className="mt-4">
          <EntryFields />
          <button className="btn-primary mt-4">Add to directory</button>
        </form>
      </details>

      {/* Existing */}
      <div className="mt-6 space-y-4">
        {entries.map((e) => (
          <details key={e.id} className="card p-5">
            <summary className="flex cursor-pointer items-center justify-between">
              <span className="font-semibold text-ink">
                {e.business_name}
                {e.category ? <span className="ml-2 text-xs font-normal text-ink-muted">{e.category}</span> : null}
              </span>
              <span className="text-xs text-ink-muted">#{e.sort_order} · edit</span>
            </summary>
            <form action={saveEntry} className="mt-4">
              <input type="hidden" name="id" value={e.id} />
              <EntryFields entry={e} />
              <button className="btn-primary mt-4">Save</button>
            </form>
            <form action={removeEntry} className="mt-2">
              <input type="hidden" name="id" value={e.id} />
              <button className="text-sm font-semibold text-rust hover:underline">
                Remove this business
              </button>
            </form>
          </details>
        ))}
      </div>
    </div>
  );
}

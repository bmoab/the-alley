import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  listDirectory,
  createDirectoryEntry,
  updateDirectoryEntry,
  deleteDirectoryEntry,
  getDirectoryEntry,
  ensureDirectoryToken,
} from "@/lib/catalog.js";
import { emailTenantInvite } from "@/lib/email.js";

export const metadata = { title: "Directory" };

const APP_URL = process.env.APP_URL || "";

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
    contact_email: (formData.get("contact_email") || "").toString().trim(),
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
    contact_email: (formData.get("contact_email") || "").toString().trim(),
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

// Generate (or reveal) the tenant's private self-edit link.
async function generateLink(formData) {
  "use server";
  ensureDirectoryToken(Number(formData.get("id")));
  refresh();
  redirect("/admin/directory#biz-" + formData.get("id"));
}

// Email the tenant their private self-edit link (needs a contact email on file).
async function emailLink(formData) {
  "use server";
  const id = Number(formData.get("id"));
  const token = ensureDirectoryToken(id);
  const entry = getDirectoryEntry(id);
  if (entry?.contact_email && token) {
    try {
      await emailTenantInvite(entry, token);
    } catch (err) {
      console.error("[directory] tenant invite email error:", err.message);
    }
  }
  refresh();
  redirect(
    "/admin/directory?invited=" + (entry?.contact_email ? id : "noemail") + "#biz-" + id
  );
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
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Tenant email (for self-edit invite)</label>
          <input name="contact_email" type="email" defaultValue={entry.contact_email || ""} placeholder="owner@shop.com" className="field" />
        </div>
        <div>
          <label className="label">Photo URL or path (optional)</label>
          <input name="photo_path" defaultValue={entry.photo_path || ""} placeholder="/uploads/shop.jpg" className="field" />
        </div>
      </div>
    </>
  );
}

/** Owner-facing block to generate/share a tenant's private self-edit link. */
function SelfEditLink({ entry }) {
  const link = entry.edit_token
    ? `${APP_URL}/business-listing/${entry.edit_token}`
    : null;
  return (
    <div className="mt-4 rounded-lg border border-ink/10 bg-paper-warm p-4">
      <p className="text-sm font-semibold text-ink">Tenant self-edit link</p>
      {link ? (
        <>
          <p className="mt-1 text-xs text-ink-muted">
            Share this private link so {entry.business_name} can manage their own
            listing (photo, description, contact). Their edits go live instantly.
          </p>
          <input
            readOnly
            value={link}
            className="field mt-2 text-xs"
          />
          <form action={emailLink} className="mt-2">
            <input type="hidden" name="id" value={entry.id} />
            <button className="btn-ghost text-sm">
              {entry.contact_email
                ? `Email link to ${entry.contact_email}`
                : "Add a tenant email above to email this link"}
            </button>
          </form>
        </>
      ) : (
        <form action={generateLink} className="mt-2">
          <input type="hidden" name="id" value={entry.id} />
          <button className="btn-ghost text-sm">
            Generate self-edit link
          </button>
        </form>
      )}
    </div>
  );
}

export default function DirectoryAdminPage({ searchParams }) {
  const entries = listDirectory();
  const invited = searchParams?.invited;

  return (
    <div>
      <p className="eyebrow">Admin</p>
      <h1 className="font-display text-3xl font-semibold text-ink">Directory</h1>
      <p className="mt-1 text-ink-muted">
        These businesses appear on the public Directory page, ordered by sort
        order. Each can manage its own listing via a private self-edit link.
      </p>

      {invited && invited !== "noemail" ? (
        <div className="mt-4 rounded-lg border border-brass/30 bg-brass/10 px-4 py-2 text-sm text-brass-dark">
          Self-edit link emailed to the tenant.
        </div>
      ) : null}
      {invited === "noemail" ? (
        <div className="mt-4 rounded-lg border border-rust/30 bg-rust/10 px-4 py-2 text-sm text-rust">
          No tenant email on file — add one and save, then try again. The link is
          ready to copy below in the meantime.
        </div>
      ) : null}

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
          <details key={e.id} id={`biz-${e.id}`} className="card p-5">
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
            <SelfEditLink entry={e} />
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

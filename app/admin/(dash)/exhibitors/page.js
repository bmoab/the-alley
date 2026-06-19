import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  listExhibitors,
  getExhibitor,
  createExhibitor,
  updateExhibitor,
  deleteExhibitor,
  ensureExhibitorToken,
  addExhibitorPhoto,
  deleteExhibitorPhoto,
} from "@/lib/catalog.js";
import { emailExhibitorInvite } from "@/lib/email.js";
import Placeholder from "@/components/Placeholder.js";
import ContentImageField from "@/components/ContentImageField.js";

export const metadata = { title: "Exhibitors" };

const APP_URL = process.env.APP_URL || "";

function refresh() {
  revalidatePath("/exhibitors");
  revalidatePath("/");
  revalidatePath("/admin/exhibitors");
}

async function addExhibitorAction(formData) {
  "use server";
  const name = (formData.get("name") || "").toString().trim();
  if (!name) redirect("/admin/exhibitors");
  createExhibitor({
    name,
    discipline: (formData.get("discipline") || "").toString().trim(),
    when_text: (formData.get("when_text") || "").toString().trim(),
    blurb: (formData.get("blurb") || "").toString().trim(),
    site_handle: (formData.get("site_handle") || "").toString().trim(),
    status: (formData.get("status") || "current").toString(),
    sort_order: formData.get("sort_order"),
    contact_email: (formData.get("contact_email") || "").toString().trim(),
  });
  refresh();
  redirect("/admin/exhibitors");
}

async function saveExhibitorAction(formData) {
  "use server";
  const id = Number(formData.get("id"));
  updateExhibitor(id, {
    name: (formData.get("name") || "").toString().trim(),
    discipline: (formData.get("discipline") || "").toString().trim(),
    when_text: (formData.get("when_text") || "").toString().trim(),
    blurb: (formData.get("blurb") || "").toString().trim(),
    site_handle: (formData.get("site_handle") || "").toString().trim(),
    status: (formData.get("status") || "current").toString(),
    sort_order: formData.get("sort_order"),
    contact_email: (formData.get("contact_email") || "").toString().trim(),
    profile_photo: (formData.get("profile_photo") || "").toString().trim() || null,
  });
  refresh();
  redirect("/admin/exhibitors#ex-" + id);
}

async function removeExhibitorAction(formData) {
  "use server";
  deleteExhibitor(Number(formData.get("id")));
  refresh();
  redirect("/admin/exhibitors");
}

async function addWorkAction(formData) {
  "use server";
  const id = Number(formData.get("exhibitor_id"));
  const path = (formData.get("image_path") || "").toString().trim();
  if (id && path) addExhibitorPhoto(id, path, (formData.get("caption") || "").toString().trim() || null, formData.get("sort_order"));
  refresh();
  redirect("/admin/exhibitors#ex-" + id);
}

async function removeWorkAction(formData) {
  "use server";
  const id = Number(formData.get("exhibitor_id"));
  deleteExhibitorPhoto(Number(formData.get("photo_id")));
  refresh();
  redirect("/admin/exhibitors#ex-" + id);
}

// Generate (or reveal) the exhibitor's private self-edit link.
async function generateLink(formData) {
  "use server";
  ensureExhibitorToken(Number(formData.get("id")));
  refresh();
  redirect("/admin/exhibitors#ex-" + formData.get("id"));
}

// Email the exhibitor their private self-edit link (needs a contact email).
async function emailLink(formData) {
  "use server";
  const id = Number(formData.get("id"));
  const token = ensureExhibitorToken(id);
  const ex = getExhibitor(id);
  if (ex?.contact_email && token) {
    try {
      await emailExhibitorInvite(ex, token);
    } catch (err) {
      console.error("[exhibitors] invite email error:", err.message);
    }
  }
  refresh();
  redirect("/admin/exhibitors?invited=" + (ex?.contact_email ? id : "noemail") + "#ex-" + id);
}

function SelfEditLink({ ex }) {
  const link = ex.edit_token ? `${APP_URL}/exhibitor/${ex.edit_token}` : null;
  return (
    <div className="mt-4 rounded-lg border border-ink/10 bg-paper-warm p-4">
      <p className="text-sm font-semibold text-ink">Exhibitor self-edit link</p>
      {link ? (
        <>
          <p className="mt-1 text-xs text-ink-muted">
            Share this private link so {ex.name} can manage their own page (bio, profile photo, work photos).
            Their edits go live instantly, and the link stays active for repeat edits.
          </p>
          <input readOnly value={link} className="field mt-2 text-xs" />
          <form action={emailLink} className="mt-2">
            <input type="hidden" name="id" value={ex.id} />
            <button className="btn-ghost text-sm">
              {ex.contact_email ? `Email link to ${ex.contact_email}` : "Add a contact email above to email this link"}
            </button>
          </form>
        </>
      ) : (
        <form action={generateLink} className="mt-2">
          <input type="hidden" name="id" value={ex.id} />
          <button className="btn-ghost text-sm">Generate self-edit link</button>
        </form>
      )}
    </div>
  );
}

function ExhibitorFields({ ex = {} }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Name</label>
          <input name="name" required defaultValue={ex.name || ""} className="field" />
        </div>
        <div>
          <label className="label">Discipline</label>
          <input name="discipline" defaultValue={ex.discipline || ""} placeholder="Painter · Oil & cold wax" className="field" />
        </div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label">Status</label>
          <select name="status" defaultValue={ex.status || "current"} className="field">
            <option value="current">Current (on view)</option>
            <option value="past">Past (archive)</option>
          </select>
        </div>
        <div>
          <label className="label">When</label>
          <input name="when_text" defaultValue={ex.when_text || ""} placeholder="On view · Jul–Sep 2026" className="field" />
        </div>
        <div>
          <label className="label">Sort order</label>
          <input name="sort_order" type="number" defaultValue={ex.sort_order ?? 0} className="field" />
        </div>
      </div>
      <div className="mt-3">
        <label className="label">Blurb</label>
        <textarea name="blurb" rows={3} defaultValue={ex.blurb || ""} className="field" />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Handle / site</label>
          <input name="site_handle" defaultValue={ex.site_handle || ""} placeholder="@artist or https://…" className="field" />
        </div>
        <div>
          <label className="label">Contact email (for future invite)</label>
          <input name="contact_email" type="email" defaultValue={ex.contact_email || ""} className="field" />
        </div>
      </div>
    </>
  );
}

export default function ExhibitorsAdminPage({ searchParams }) {
  const exhibitors = listExhibitors();
  const invited = searchParams?.invited;

  return (
    <div>
      <p className="eyebrow">Admin</p>
      <h1 className="font-display text-3xl font-semibold text-ink">Exhibitors</h1>
      <p className="mt-1 text-ink-muted">
        Artists featured in the gallery. &ldquo;Current&rdquo; show as large feature blocks; &ldquo;past&rdquo;
        become flip cards on the public Exhibitors page. Invite an artist to manage their own page via a private link.
      </p>

      {invited && invited !== "noemail" ? (
        <div className="mt-4 rounded-lg border border-brass/30 bg-brass/10 px-4 py-2 text-sm text-brass-dark">
          Self-edit link emailed to the exhibitor.
        </div>
      ) : null}
      {invited === "noemail" ? (
        <div className="mt-4 rounded-lg border border-rust/30 bg-rust/10 px-4 py-2 text-sm text-rust">
          No contact email on file — add one and save, then try again. The link is ready to copy below.
        </div>
      ) : null}

      <details className="mt-6 card p-5" open={exhibitors.length === 0}>
        <summary className="cursor-pointer font-semibold text-ink">+ Add an exhibitor</summary>
        <form action={addExhibitorAction} className="mt-4">
          <ExhibitorFields />
          <button className="btn-primary mt-4">Add exhibitor</button>
        </form>
      </details>

      <div className="mt-6 space-y-4">
        {exhibitors.map((ex) => (
          <details key={ex.id} id={`ex-${ex.id}`} className="card p-5">
            <summary className="flex cursor-pointer items-center justify-between">
              <span className="font-semibold text-ink">
                {ex.name}
                <span className="ml-2 text-xs font-normal text-ink-muted">{ex.discipline}</span>
              </span>
              <span className="text-xs uppercase tracking-wider text-ink-muted">{ex.status}</span>
            </summary>

            <form action={saveExhibitorAction} className="mt-4">
              <input type="hidden" name="id" value={ex.id} />
              <ExhibitorFields ex={ex} />
              <div className="mt-3">
                <ContentImageField name="profile_photo" label="Profile photo" value={ex.profile_photo || ""} />
              </div>
              <button className="btn-primary mt-4">Save</button>
            </form>

            {/* Work photos */}
            <div className="mt-5 rounded-lg border border-ink/10 bg-paper-warm p-4">
              <p className="text-sm font-semibold text-ink">Work photos</p>
              {ex.works?.length ? (
                <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {ex.works.map((w, i) => (
                    <div key={w.id} className="overflow-hidden rounded-lg border border-ink/10 bg-paper-card">
                      <Placeholder src={w.image_path} label={w.caption || "Work"} seed={i} className="h-20 w-full" rounded="rounded-none" />
                      <form action={removeWorkAction} className="p-1 text-center">
                        <input type="hidden" name="exhibitor_id" value={ex.id} />
                        <input type="hidden" name="photo_id" value={w.id} />
                        <button className="text-[11px] font-semibold text-rust hover:underline">Remove</button>
                      </form>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-xs text-ink-muted">No work photos yet.</p>
              )}
              <form action={addWorkAction} className="mt-3 grid gap-2">
                <input type="hidden" name="exhibitor_id" value={ex.id} />
                <ContentImageField name="image_path" label="Add a work photo" />
                <div className="flex items-center gap-2">
                  <input name="caption" placeholder="Caption (optional)" className="field text-sm" />
                  <button className="btn-ghost text-sm">Add work</button>
                </div>
              </form>
            </div>

            <SelfEditLink ex={ex} />

            <form action={removeExhibitorAction} className="mt-3">
              <input type="hidden" name="id" value={ex.id} />
              <button className="text-sm font-semibold text-rust hover:underline">Remove this exhibitor</button>
            </form>
          </details>
        ))}
      </div>
    </div>
  );
}

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  listExhibitors,
  getExhibitor,
  createExhibitor,
  updateExhibitor,
  deleteExhibitor,
  ensureExhibitorToken,
  exhibitorPhase,
} from "@/lib/catalog.js";
import { emailExhibitorInvite } from "@/lib/email.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import Button from "@/components/admin/ui/Button.js";

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
    contact_email: (formData.get("contact_email") || "").toString().trim(),
    active: formData.get("active") != null,
    active_from: (formData.get("active_from") || "").toString().trim(),
    active_until: (formData.get("active_until") || "").toString().trim(),
    sort_order: formData.get("sort_order"),
  });
  refresh();
  redirect("/admin/exhibitors");
}

async function saveExhibitorAction(formData) {
  "use server";
  const id = Number(formData.get("id"));
  updateExhibitor(id, {
    name: (formData.get("name") || "").toString().trim(),
    contact_email: (formData.get("contact_email") || "").toString().trim(),
    active: formData.get("active") != null,
    active_from: (formData.get("active_from") || "").toString().trim(),
    active_until: (formData.get("active_until") || "").toString().trim(),
    sort_order: formData.get("sort_order"),
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

async function generateLink(formData) {
  "use server";
  ensureExhibitorToken(Number(formData.get("id")));
  refresh();
  redirect("/admin/exhibitors#ex-" + formData.get("id"));
}

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
  if (ex?.contact_email) {
    redirect(
      "/admin/exhibitors?toast=" +
        encodeURIComponent(`Self-edit link emailed to ${ex.contact_email}.`) +
        "&toastType=success#ex-" + id
    );
  }
  redirect(
    "/admin/exhibitors?toast=" +
      encodeURIComponent(
        "No email on file — add one and save, then try again. The link is ready to copy below."
      ) +
      "&toastType=error#ex-" + id
  );
}

function ExhibitorFields({ ex = {} }) {
  const isNew = !ex.id;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Name</label>
          <input name="name" required defaultValue={ex.name || ""} placeholder="Artist or studio name" className="field" />
        </div>
        <div>
          <label className="label">Email (for their self-edit invite)</label>
          <input name="contact_email" type="email" defaultValue={ex.contact_email || ""} placeholder="artist@email.com" className="field" />
        </div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        <label className="flex items-center gap-2 self-end pb-2">
          <input type="checkbox" name="active" defaultChecked={isNew ? true : Number(ex.active) === 1} />
          <span className="text-sm font-semibold text-ink-soft">Active</span>
        </label>
        <div>
          <label className="label">On view from</label>
          <input name="active_from" type="date" defaultValue={ex.active_from || ""} className="field" />
        </div>
        <div>
          <label className="label">On view until</label>
          <input name="active_until" type="date" defaultValue={ex.active_until || ""} className="field" />
        </div>
        <div>
          <label className="label">Sort order</label>
          <input name="sort_order" type="number" defaultValue={ex.sort_order ?? 0} className="field" />
        </div>
      </div>
      <p className="mt-3 text-xs text-ink-muted">
        After the &ldquo;on view until&rdquo; date passes, they automatically move to the Past archive. Their bio,
        discipline, photos, and work images are all added by the artist from their private link below.
      </p>
    </>
  );
}

function SelfEditLink({ ex }) {
  const link = ex.edit_token ? `${APP_URL}/exhibitor/${ex.edit_token}` : null;
  return (
    <div className="mt-4 rounded-xl border border-line bg-paper-warm p-4">
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
            <Button type="submit" variant="ghost" size="sm">
              {ex.contact_email ? `Email link to ${ex.contact_email}` : "Add an email above to email this link"}
            </Button>
          </form>
        </>
      ) : (
        <form action={generateLink} className="mt-2">
          <input type="hidden" name="id" value={ex.id} />
          <Button type="submit" variant="ghost" size="sm">Generate self-edit link</Button>
        </form>
      )}
    </div>
  );
}

const PHASE_LABEL = { current: "On view", past: "Past", hidden: "Hidden" };

export default function ExhibitorsAdminPage() {
  const exhibitors = listExhibitors();

  return (
    <div>
      <PageHeader
        title="Exhibitors"
        subtitle="Set up an artist with just their name, email, and dates — then send their private link so they fill in everything else. They show as “on view” during their dates and move to the Past archive after."
      />

      <details className="card p-5" open={exhibitors.length === 0}>
        <summary className="cursor-pointer font-semibold text-ink">+ Add an exhibitor</summary>
        <form action={addExhibitorAction} className="mt-4">
          <ExhibitorFields />
          <Button type="submit" className="mt-4">Add exhibitor</Button>
        </form>
      </details>

      <div className="mt-6 space-y-4">
        {exhibitors.map((ex) => {
          const phase = exhibitorPhase(ex);
          return (
            <details key={ex.id} id={`ex-${ex.id}`} className="card p-5">
              <summary className="flex cursor-pointer items-center justify-between">
                <span className="font-semibold text-ink">{ex.name}</span>
                <span className="text-xs uppercase tracking-wider text-ink-muted">{PHASE_LABEL[phase]}</span>
              </summary>
              <form action={saveExhibitorAction} className="mt-4">
                <input type="hidden" name="id" value={ex.id} />
                <ExhibitorFields ex={ex} />
                <Button type="submit" className="mt-4">Save</Button>
              </form>
              <SelfEditLink ex={ex} />
              <form action={removeExhibitorAction} className="mt-3">
                <input type="hidden" name="id" value={ex.id} />
                <button className="text-sm font-semibold text-rust hover:underline">Remove this exhibitor</button>
              </form>
            </details>
          );
        })}
      </div>
    </div>
  );
}

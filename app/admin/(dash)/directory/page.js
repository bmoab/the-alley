import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  listDirectory,
  createDirectoryEntry,
  updateDirectoryEntry,
  deleteDirectoryEntry,
  getDirectoryEntry,
  ensureDirectoryToken,
  listSuites,
  setTenantSuites,
  updateSuiteInfo,
} from "@/lib/catalog.js";
import { emailTenantInvite } from "@/lib/email.js";
import { zoneSpace } from "@/lib/building-map.js";
import ContentImageField from "@/components/ContentImageField.js";

export const metadata = { title: "Directory" };

const APP_URL = process.env.APP_URL || "";

function refresh() {
  revalidatePath("/directory");
  revalidatePath("/");
  revalidatePath("/admin/directory");
}

/* ---- Tenants ---- */

async function addTenant(formData) {
  "use server";
  const id = createDirectoryEntry({
    business_name: (formData.get("business_name") || "").toString().trim(),
    contact_email: (formData.get("contact_email") || "").toString().trim(),
    active: formData.get("active") != null,
    active_from: (formData.get("active_from") || "").toString().trim(),
    active_until: (formData.get("active_until") || "").toString().trim(),
  });
  setTenantSuites(id, formData.getAll("suite_ids"));
  refresh();
  redirect("/admin/directory#biz-" + id);
}

async function saveTenant(formData) {
  "use server";
  const id = Number(formData.get("id"));
  updateDirectoryEntry(id, {
    business_name: (formData.get("business_name") || "").toString().trim(),
    contact_email: (formData.get("contact_email") || "").toString().trim(),
    active: formData.get("active") != null,
    active_from: (formData.get("active_from") || "").toString().trim(),
    active_until: (formData.get("active_until") || "").toString().trim(),
  });
  setTenantSuites(id, formData.getAll("suite_ids"));
  refresh();
  redirect("/admin/directory#biz-" + id);
}

async function removeTenant(formData) {
  "use server";
  const id = Number(formData.get("id"));
  setTenantSuites(id, []); // free its suites
  deleteDirectoryEntry(id);
  refresh();
  redirect("/admin/directory");
}

async function generateLink(formData) {
  "use server";
  ensureDirectoryToken(Number(formData.get("id")));
  refresh();
  redirect("/admin/directory#biz-" + formData.get("id"));
}

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
  redirect("/admin/directory?invited=" + (entry?.contact_email ? id : "noemail") + "#biz-" + id);
}

/* ---- Suites ---- */

async function saveSuite(formData) {
  "use server";
  updateSuiteInfo(Number(formData.get("id")), {
    name: (formData.get("name") || "").toString().trim(),
    available: formData.get("available") != null,
    vacant_photo: (formData.get("vacant_photo") || "").toString().trim() || null,
    vacant_blurb: (formData.get("vacant_blurb") || "").toString().trim(),
  });
  refresh();
  redirect("/admin/directory#suite-" + formData.get("id"));
}

function TenantFields({ entry = {}, suites = [] }) {
  const isNew = !entry.id;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Business name</label>
          <input name="business_name" required defaultValue={entry.business_name || ""} className="field" />
        </div>
        <div>
          <label className="label">Tenant email (for their self-edit invite)</label>
          <input name="contact_email" type="email" defaultValue={entry.contact_email || ""} placeholder="owner@shop.com" className="field" />
        </div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="flex items-center gap-2 self-end pb-2">
          <input type="checkbox" name="active" defaultChecked={isNew ? true : Number(entry.active) === 1} />
          <span className="text-sm font-semibold text-ink-soft">Active (show on the website)</span>
        </label>
        <div>
          <label className="label">Active from (optional)</label>
          <input name="active_from" type="date" defaultValue={entry.active_from || ""} className="field" />
        </div>
        <div>
          <label className="label">Active until (optional)</label>
          <input name="active_until" type="date" defaultValue={entry.active_until || ""} className="field" />
        </div>
      </div>

      {/* Suite assignment — available when adding and when editing. */}
      <div className="mt-3">
        <label className="label">Suites occupied (select one or more)</label>
        <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-lg border border-ink/10 bg-paper-warm p-3">
          {suites.map((s) => {
            const mine = !isNew && s.tenant_id === entry.id;
            const takenByOther = s.tenant_id && !mine;
            return (
              <label key={s.id} className={`flex items-center gap-2 text-sm ${takenByOther ? "text-ink-muted/60" : "text-ink-soft"}`}>
                <input type="checkbox" name="suite_ids" value={s.id} defaultChecked={mine} disabled={takenByOther} />
                <span>
                  {s.name || s.zone}
                  <span className="ml-1 text-xs text-ink-muted">· {s.floor}</span>
                  {takenByOther ? <span className="ml-1 text-xs">(taken)</span> : null}
                </span>
              </label>
            );
          })}
        </div>
        <p className="mt-1 text-xs text-ink-muted">A suite already held by another tenant is greyed out — free it from that tenant first.</p>
      </div>

      <p className="mt-4 text-xs text-ink-muted">
        Their description, category, photo, and links are all filled in by the tenant from their private link below.
      </p>
    </>
  );
}

function SelfEditLink({ entry }) {
  const link = entry.edit_token ? `${APP_URL}/business-listing/${entry.edit_token}` : null;
  return (
    <div className="mt-4 rounded-lg border border-ink/10 bg-paper-warm p-4">
      <p className="text-sm font-semibold text-ink">Tenant self-edit link</p>
      {link ? (
        <>
          <p className="mt-1 text-xs text-ink-muted">
            Share this private link so {entry.business_name} can manage their own listing (photo, description,
            contact). Their edits go live instantly.
          </p>
          <input readOnly value={link} className="field mt-2 text-xs" />
          <form action={emailLink} className="mt-2">
            <input type="hidden" name="id" value={entry.id} />
            <button className="btn-ghost text-sm">
              {entry.contact_email ? `Email link to ${entry.contact_email}` : "Add a tenant email above to email this link"}
            </button>
          </form>
        </>
      ) : (
        <form action={generateLink} className="mt-2">
          <input type="hidden" name="id" value={entry.id} />
          <button className="btn-ghost text-sm">Generate self-edit link</button>
        </form>
      )}
    </div>
  );
}

function SuiteRow({ suite, tenant }) {
  return (
    <details id={`suite-${suite.id}`} className="card p-4">
      <summary className="flex cursor-pointer items-center justify-between gap-3">
        <span className="font-semibold text-ink">
          {suite.name || suite.zone}
          <span className="ml-2 text-xs font-normal text-ink-muted">
            {tenant ? tenant.business_name : suite.available ? "Available" : "Vacant"}
          </span>
        </span>
        <span className="shrink-0 text-xs text-ink-muted">zone {suite.zone} · edit ▾</span>
      </summary>
      <form action={saveSuite} className="mt-3 grid gap-3">
        <input type="hidden" name="id" value={suite.id} />
        <div>
          <label className="label">Suite name / number</label>
          <input name="name" defaultValue={suite.name || ""} placeholder={suite.zone} className="field" />
        </div>
        {tenant ? (
          <p className="text-xs text-ink-muted">
            Occupied by <strong>{tenant.business_name}</strong>. Change this from the tenant&apos;s suite checkboxes above.
          </p>
        ) : (
          <div className="rounded-lg border border-ink/10 bg-paper-warm p-4">
            <p className="text-sm font-semibold text-ink">Vacant — show as available?</p>
            <label className="mt-2 flex items-center gap-2">
              <input type="checkbox" name="available" defaultChecked={Number(suite.available) === 1} />
              <span className="text-sm font-semibold text-ink-soft">Mark as available to lease</span>
            </label>
            <div className="mt-3">
              <label className="label">Blurb about the space</label>
              <textarea name="vacant_blurb" rows={2} defaultValue={suite.vacant_blurb || ""} placeholder="A bright corner studio with street-facing windows…" className="field" />
            </div>
            <div className="mt-3">
              <ContentImageField name="vacant_photo" label="Photo of the space" value={suite.vacant_photo || ""} />
            </div>
          </div>
        )}
        <button className="btn-primary w-fit">Save suite</button>
      </form>
    </details>
  );
}

export default function DirectoryAdminPage({ searchParams }) {
  const tenants = listDirectory();
  // Exclude the two rentable spaces (gallery = Main Floor, 200 = Loft) — those
  // are managed under Spaces, not assigned to tenants.
  const suites = listSuites().filter((s) => !zoneSpace(s.zone));
  const byId = Object.fromEntries(tenants.map((t) => [t.id, t]));
  const invited = searchParams?.invited;

  const lower = suites.filter((s) => s.floor === "lower");
  const upper = suites.filter((s) => s.floor !== "lower");

  return (
    <div>
      <p className="eyebrow">Admin</p>
      <h1 className="font-display text-3xl font-semibold text-ink">Directory</h1>
      <p className="mt-1 text-ink-muted">
        Manage the businesses in the building and which suites they occupy. The public directory and the
        interactive floor map update automatically.
      </p>

      {invited && invited !== "noemail" ? (
        <div className="mt-4 rounded-lg border border-brass/30 bg-brass/10 px-4 py-2 text-sm text-brass-dark">
          Self-edit link emailed to the tenant.
        </div>
      ) : null}
      {invited === "noemail" ? (
        <div className="mt-4 rounded-lg border border-rust/30 bg-rust/10 px-4 py-2 text-sm text-rust">
          No tenant email on file — add one and save, then try again. The link is ready to copy below.
        </div>
      ) : null}

      {/* Tenants */}
      <h2 className="mt-8 font-display text-xl font-semibold text-ink">Tenants</h2>
      <details className="mt-3 card p-5" open={tenants.length === 0}>
        <summary className="cursor-pointer font-semibold text-ink">+ Add a tenant</summary>
        <form action={addTenant} className="mt-4">
          <TenantFields suites={suites} />
          <button className="btn-primary mt-4">Add tenant</button>
        </form>
      </details>

      <div className="mt-4 space-y-4">
        {tenants.map((e) => {
          const theirSuites = suites.filter((s) => s.tenant_id === e.id).map((s) => s.name || s.zone);
          return (
            <details key={e.id} id={`biz-${e.id}`} className="card p-5">
              <summary className="flex cursor-pointer items-center justify-between">
                <span className="font-semibold text-ink">{e.business_name}</span>
                <span className="text-xs text-ink-muted">
                  {theirSuites.length ? `Suite${theirSuites.length > 1 ? "s" : ""} ${theirSuites.join(", ")}` : "no suite"} · edit ▾
                </span>
              </summary>
              <form action={saveTenant} className="mt-4">
                <input type="hidden" name="id" value={e.id} />
                <TenantFields entry={e} suites={suites} />
                <button className="btn-primary mt-4">Save</button>
              </form>
              <SelfEditLink entry={e} />
              <form action={removeTenant} className="mt-2">
                <input type="hidden" name="id" value={e.id} />
                <button className="text-sm font-semibold text-rust hover:underline">Remove this tenant</button>
              </form>
            </details>
          );
        })}
      </div>

      {/* Building suites */}
      <h2 className="mt-10 font-display text-xl font-semibold text-ink">Building suites</h2>
      <p className="mt-1 text-sm text-ink-muted">
        Name each suite and, for empty ones, add a photo + blurb and mark it available to lease.
      </p>
      {[
        { title: "Lower Floor", list: lower },
        { title: "Upper Floor", list: upper },
      ].map((f) =>
        f.list.length ? (
          <div key={f.title} className="mt-4">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-ink-muted">{f.title}</h3>
            <div className="space-y-3">
              {f.list.map((s) => (
                <SuiteRow key={s.id} suite={s} tenant={s.tenant_id ? byId[s.tenant_id] : null} />
              ))}
            </div>
          </div>
        ) : null
      )}
    </div>
  );
}

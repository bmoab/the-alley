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
  suitesForTenant,
  tenantsForSuite,
} from "@/lib/catalog.js";
import { emailTenantInvite } from "@/lib/email.js";
import { zoneSpace } from "@/lib/building-map.js";
import ContentImageField from "@/components/ContentImageField.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import Button from "@/components/admin/ui/Button.js";

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
  if (entry?.contact_email) {
    redirect(
      "/admin/directory?toast=" +
        encodeURIComponent(`Self-edit link emailed to ${entry.contact_email}.`) +
        "&toastType=success#biz-" + id
    );
  }
  redirect(
    "/admin/directory?toast=" +
      encodeURIComponent(
        "No tenant email on file — add one and save, then try again. The link is ready to copy below."
      ) +
      "&toastType=error#biz-" + id
  );
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

function TenantFields({ entry = {}, suites = [], occupiedIds = [], suiteTenants = {} }) {
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
            const mine = occupiedIds.includes(s.id);
            const others = (suiteTenants[s.id] || []).filter((t) => t.id !== entry.id);
            return (
              <label key={s.id} className="flex items-center gap-2 text-sm text-ink-soft">
                <input type="checkbox" name="suite_ids" value={s.id} defaultChecked={mine} />
                <span>
                  {s.name || s.zone}
                  <span className="ml-1 text-xs text-ink-muted">· {s.floor}</span>
                  {others.length ? (
                    <span className="ml-1 text-xs text-ink-muted">
                      · shared with {others.map((t) => t.business_name).join(", ")}
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>
        <p className="mt-1 text-xs text-ink-muted">
          Two businesses can share one suite — just check the same suite for both. Each keeps its own directory page.
        </p>
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
    <div className="mt-4 rounded-xl border border-line bg-paper-warm p-4">
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
            <Button type="submit" variant="ghost" size="sm">
              {entry.contact_email ? `Email link to ${entry.contact_email}` : "Add a tenant email above to email this link"}
            </Button>
          </form>
        </>
      ) : (
        <form action={generateLink} className="mt-2">
          <input type="hidden" name="id" value={entry.id} />
          <Button type="submit" variant="ghost" size="sm">Generate self-edit link</Button>
        </form>
      )}
    </div>
  );
}

function SuiteRow({ suite, tenants = [] }) {
  const occupantNames = tenants.map((t) => t.business_name).join(" & ");
  return (
    <details id={`suite-${suite.id}`} className="card p-4">
      <summary className="flex cursor-pointer items-center justify-between gap-3">
        <span className="font-semibold text-ink">
          {suite.name || suite.zone}
          <span className="ml-2 text-xs font-normal text-ink-muted">
            {tenants.length ? occupantNames : suite.available ? "Available" : "Vacant"}
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
        {tenants.length ? (
          <p className="text-xs text-ink-muted">
            Occupied by <strong>{occupantNames}</strong>. Change this from the tenant&apos;s suite checkboxes above.
          </p>
        ) : (
          <div className="rounded-xl border border-line bg-paper-warm p-4">
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
        <Button type="submit" className="w-fit">Save suite</Button>
      </form>
    </details>
  );
}

export default function DirectoryAdminPage() {
  const tenants = listDirectory();
  // Exclude the two rentable spaces (gallery = Main Floor, 200 = Loft) — those
  // are managed under Spaces, not assigned to tenants.
  const suites = listSuites().filter((s) => !zoneSpace(s.zone));
  // Junction-backed occupancy maps: which tenants share each suite, and which
  // suite ids each tenant holds (a suite may have several tenants, and vice versa).
  const suiteTenants = Object.fromEntries(suites.map((s) => [s.id, tenantsForSuite(s.id)]));
  const occupiedByTenant = Object.fromEntries(
    tenants.map((t) => [t.id, suitesForTenant(t.id).map((s) => s.id)])
  );
  const suiteById = Object.fromEntries(suites.map((s) => [s.id, s]));

  const lower = suites.filter((s) => s.floor === "lower");
  const upper = suites.filter((s) => s.floor !== "lower");

  return (
    <div>
      <PageHeader
        title="Directory"
        subtitle="Manage the businesses in the building and which suites they occupy. The public directory and the interactive floor map update automatically."
      />

      {/* Tenants */}
      <h2 className="text-xl font-semibold text-ink">Tenants</h2>
      <details className="mt-3 card p-5" open={tenants.length === 0}>
        <summary className="cursor-pointer font-semibold text-ink">+ Add a tenant</summary>
        <form action={addTenant} className="mt-4">
          <TenantFields suites={suites} suiteTenants={suiteTenants} />
          <Button type="submit" className="mt-4">Add tenant</Button>
        </form>
      </details>

      <div className="mt-4 space-y-4">
        {tenants.map((e) => {
          const theirSuites = (occupiedByTenant[e.id] || [])
            .map((id) => suiteById[id])
            .filter(Boolean)
            .map((s) => s.name || s.zone);
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
                <TenantFields entry={e} suites={suites} occupiedIds={occupiedByTenant[e.id] || []} suiteTenants={suiteTenants} />
                <Button type="submit" className="mt-4">Save</Button>
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
      <h2 className="mt-10 text-xl font-semibold text-ink">Building suites</h2>
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
                <SuiteRow key={s.id} suite={s} tenants={suiteTenants[s.id] || []} />
              ))}
            </div>
          </div>
        ) : null
      )}
    </div>
  );
}

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { listSuites, updateSuite, listDirectory } from "@/lib/catalog.js";
import ContentImageField from "@/components/ContentImageField.js";

export const metadata = { title: "Suites" };

function refresh() {
  revalidatePath("/directory");
  revalidatePath("/admin/suites");
  revalidatePath("/admin/directory");
}

async function saveSuite(formData) {
  "use server";
  const id = Number(formData.get("id"));
  updateSuite(id, {
    name: (formData.get("name") || "").toString().trim(),
    tenant_id: formData.get("tenant_id") || null,
    available: formData.get("available") != null,
    vacant_photo: (formData.get("vacant_photo") || "").toString().trim() || null,
    vacant_blurb: (formData.get("vacant_blurb") || "").toString().trim(),
    sort_order: formData.get("sort_order"),
  });
  refresh();
  redirect("/admin/suites#suite-" + id);
}

export default function SuitesAdminPage() {
  const suites = listSuites();
  const tenants = listDirectory();
  const lower = suites.filter((s) => s.floor === "lower");
  const upper = suites.filter((s) => s.floor !== "lower");

  return (
    <div>
      <p className="eyebrow">Admin</p>
      <h1 className="font-display text-3xl font-semibold text-ink">Suites</h1>
      <p className="mt-1 text-ink-muted">
        Name each suite, assign which tenant occupies it (a tenant can hold more than one), and for an empty
        suite add a photo + blurb so it shows as available on the interactive floor map.
      </p>

      <Floor title="Lower Floor" suites={lower} tenants={tenants} />
      <Floor title="Upper Floor" suites={upper} tenants={tenants} />
    </div>
  );
}

function Floor({ title, suites, tenants }) {
  if (!suites.length) return null;
  return (
    <>
      <h2 className="mt-8 font-display text-xl font-semibold text-ink">{title}</h2>
      <div className="mt-3 space-y-3">
        {suites.map((s) => {
          const tenant = tenants.find((t) => t.id === s.tenant_id);
          return (
            <details key={s.id} id={`suite-${s.id}`} className="card p-5">
              <summary className="flex cursor-pointer items-center justify-between gap-3">
                <span className="font-semibold text-ink">
                  {s.name || s.zone}
                  <span className="ml-2 text-xs font-normal text-ink-muted">
                    {tenant ? tenant.business_name : s.available ? "Available" : "Vacant"}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-ink-muted">zone {s.zone} · edit ▾</span>
              </summary>

              <form action={saveSuite} className="mt-4 grid gap-3">
                <input type="hidden" name="id" value={s.id} />
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="label">Suite name / number</label>
                    <input name="name" defaultValue={s.name || ""} placeholder={s.zone} className="field" />
                  </div>
                  <div>
                    <label className="label">Occupied by</label>
                    <select name="tenant_id" defaultValue={s.tenant_id || ""} className="field">
                      <option value="">— Vacant —</option>
                      {tenants.map((t) => (
                        <option key={t.id} value={t.id}>{t.business_name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Order</label>
                    <input name="sort_order" type="number" defaultValue={s.sort_order ?? 0} className="field" />
                  </div>
                </div>

                <div className="rounded-lg border border-ink/10 bg-paper-warm p-4">
                  <p className="text-sm font-semibold text-ink">When this suite is vacant</p>
                  <p className="mt-1 text-xs text-ink-muted">
                    Shown on the floor map only when no tenant is assigned.
                  </p>
                  <label className="mt-3 flex items-center gap-2">
                    <input type="checkbox" name="available" defaultChecked={Number(s.available) === 1} />
                    <span className="text-sm font-semibold text-ink-soft">Mark as available to lease</span>
                  </label>
                  <div className="mt-3">
                    <label className="label">Blurb about the space</label>
                    <textarea name="vacant_blurb" rows={2} defaultValue={s.vacant_blurb || ""} placeholder="A bright corner studio with street-facing windows…" className="field" />
                  </div>
                  <div className="mt-3">
                    <ContentImageField name="vacant_photo" label="Photo of the space" value={s.vacant_photo || ""} />
                  </div>
                </div>

                <button className="btn-primary w-fit">Save suite</button>
              </form>
            </details>
          );
        })}
      </div>
    </>
  );
}

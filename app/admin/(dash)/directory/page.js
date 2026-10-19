import Link from "next/link";
import { ImageIcon, Plus, Store } from "lucide-react";
import { listDirectory, listSuites, suitesForTenant, tenantsForSuite } from "@/lib/catalog.js";
import { zoneSpace } from "@/lib/building-map.js";
import { db } from "@/lib/db.js";
import { venueToday, formatMoney } from "@/lib/constants.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import Badge from "@/components/admin/ui/Badge.js";
import Dialog from "@/components/admin/ui/Dialog.js";
import SuiteForm from "@/components/admin/directory/SuiteForm.js";
import AddTenantForm from "@/components/admin/directory/AddTenantForm.js";
import { requireAdmin } from "@/lib/auth.js";
import { addTenant, saveSuite } from "./actions.js";
import { tenantStatus, tenantPhoto, initials } from "./shared.js";

export const metadata = { title: "Directory" };

/**
 * The building at a glance: every business as a card (tap one for its page),
 * then the suites, floor by floor (tap one to edit it).
 */
export default async function DirectoryAdminPage() {
  await requireAdmin();
  const today = venueToday();
  const month = today.slice(0, 7);
  const tenants = listDirectory();
  // The rentable rooms (Main Floor, Loft, Conference) live in Pages → Spaces.
  const suites = listSuites().filter((s) => !zoneSpace(s.zone));
  const suiteTenants = Object.fromEntries(suites.map((s) => [s.id, tenantsForSuite(s.id)]));
  const paidRent = new Set(db.prepare("SELECT directory_id FROM rent_payments WHERE month = ?").all(month).map((r) => r.directory_id));

  const lower = suites.filter((s) => s.floor === "lower");
  const upper = suites.filter((s) => s.floor !== "lower");
  const open = suites.filter((s) => !suiteTenants[s.id].length);

  return (
    <div>
      <PageHeader
        title="Directory"
        subtitle="The businesses in the building and the suites they're in. The public directory and the floor map update on their own."
        actions={
          <Dialog
            title="Add a business"
            trigger={
              <>
                <Plus className="h-4 w-4" aria-hidden="true" /> Add business
              </>
            }
            triggerClassName="inline-flex h-10 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-paper transition hover:bg-ink-soft"
          >
            <AddTenantForm action={addTenant} />
          </Dialog>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2 text-sm">
        <span className="rounded-full border border-line bg-paper px-3 py-1 text-ink-soft">
          <b className="text-ink">{tenants.length}</b> {tenants.length === 1 ? "business" : "businesses"}
        </span>
        <span className="rounded-full border border-line bg-paper px-3 py-1 text-ink-soft">
          <b className="text-ink">{suites.length - open.length}</b> of {suites.length} suites filled
        </span>
        {open.some((s) => Number(s.available) === 1) ? (
          <span className="rounded-full border border-verde-deep/30 bg-verde/50 px-3 py-1 text-ink">
            <b>{open.filter((s) => Number(s.available) === 1).length}</b> listed as available
          </span>
        ) : null}
      </div>

      {/* Businesses */}
      {tenants.length ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {tenants.map((t) => {
            const theirs = suitesForTenant(t.id).map((s) => s.name || s.zone);
            const status = tenantStatus(t, today);
            const photo = tenantPhoto(t);
            const hasRent = t.rent_amount || t.rent_link;
            return (
              <Link
                key={t.id}
                href={`/admin/directory/${t.id}`}
                className="group card overflow-hidden p-0 transition duration-200 hover:-translate-y-0.5 hover:border-verde-deep/40 hover:shadow-card-hover"
              >
                <div className="relative aspect-[2/1] overflow-hidden bg-verde/50">
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-3xl font-semibold tracking-wide text-verde-deep">
                      {initials(t.business_name)}
                    </span>
                  )}
                  {status.key !== "live" ? (
                    <span className="absolute left-3 top-3">
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </span>
                  ) : null}
                </div>
                <div className="p-4">
                  <p className="truncate text-base font-semibold text-ink">{t.business_name}</p>
                  <p className="mt-0.5 truncate text-xs text-ink-muted">{t.category || "No category yet"}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {theirs.length ? (
                      theirs.map((n) => (
                        <span key={n} className="rounded-full bg-paper-warm px-2.5 py-0.5 text-xs font-semibold text-ink-soft">
                          Suite {n}
                        </span>
                      ))
                    ) : (
                      <span className="rounded-full bg-paper-warm px-2.5 py-0.5 text-xs text-ink-muted">No suite</span>
                    )}
                    {hasRent ? (
                      <span
                        className={
                          paidRent.has(t.id)
                            ? "rounded-full bg-verde/60 px-2.5 py-0.5 text-xs font-semibold text-ink"
                            : "rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800"
                        }
                      >
                        {paidRent.has(t.id) ? "Rent paid" : t.rent_amount ? `Rent ${formatMoney(t.rent_amount)} due` : "Rent due"}
                      </span>
                    ) : null}
                    {t.shares_staff_cost ? (
                      <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-800">Shares staff</span>
                    ) : null}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="card flex flex-col items-center gap-2 p-10 text-center">
          <Store className="h-8 w-8 text-verde-deep" aria-hidden="true" />
          <p className="font-semibold text-ink">No businesses yet</p>
          <p className="text-sm text-ink-muted">Add the first one with “Add business” above.</p>
        </div>
      )}

      {/* Suites */}
      <h2 className="mt-12 text-xl font-semibold text-ink">Suites</h2>
      <p className="mt-1 text-sm text-ink-muted">Tap a suite to rename it, or list an empty one as available with a photo.</p>
      {[
        { title: "Upper floor", list: upper },
        { title: "Lower floor", list: lower },
      ].map((f) =>
        f.list.length ? (
          <div key={f.title} className="mt-5">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">{f.title}</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {f.list.map((s) => {
                const who = suiteTenants[s.id].map((t) => t.business_name);
                const available = !who.length && Number(s.available) === 1;
                return (
                  <Dialog
                    key={s.id}
                    title={`Suite ${s.name || s.zone}`}
                    triggerLabel={`Edit suite ${s.name || s.zone}`}
                    triggerClassName="card block overflow-hidden p-0 text-left transition duration-200 hover:-translate-y-0.5 hover:border-verde-deep/40 hover:shadow-card-hover"
                    trigger={
                      <>
                        <span className="relative block aspect-[3/2] bg-paper-warm">
                          {!who.length && s.vacant_photo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={s.vacant_photo} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center text-2xl font-semibold text-ink/25">
                              {s.name || s.zone}
                            </span>
                          )}
                          <span className="absolute left-2 top-2">
                            {who.length ? (
                              <Badge tone="ink">Occupied</Badge>
                            ) : available ? (
                              <Badge tone="success">Available</Badge>
                            ) : (
                              <Badge tone="neutral">Empty</Badge>
                            )}
                          </span>
                          {!who.length && !s.vacant_photo ? (
                            <ImageIcon className="absolute bottom-2 right-2 h-4 w-4 text-ink/25" aria-hidden="true" />
                          ) : null}
                        </span>
                        <span className="block p-3">
                          <span className="block text-sm font-semibold text-ink">Suite {s.name || s.zone}</span>
                          <span className="block truncate text-xs text-ink-muted">{who.length ? who.join(" & ") : available ? "Listed for lease" : "Not listed"}</span>
                        </span>
                      </>
                    }
                  >
                    <SuiteForm suite={s} occupants={who} action={saveSuite} />
                  </Dialog>
                );
              })}
            </div>
          </div>
        ) : null
      )}
    </div>
  );
}

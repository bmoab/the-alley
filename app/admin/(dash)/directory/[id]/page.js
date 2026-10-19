import { notFound } from "next/navigation";
import { Building2, CalendarRange, Eye, KeyRound, Mail, Receipt, Store, Users } from "lucide-react";
import {
  getDirectoryEntry,
  listSuites,
  suitesForTenant,
  tenantsForSuite,
  parseDirectoryLinks,
  directorySlug,
  isLiveNow,
} from "@/lib/catalog.js";
import { zoneSpace } from "@/lib/building-map.js";
import { db } from "@/lib/db.js";
import { venueToday, formatMoney, formatDateShort } from "@/lib/constants.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import Badge from "@/components/admin/ui/Badge.js";
import Button from "@/components/admin/ui/Button.js";
import CopyField from "@/components/admin/ui/CopyField.js";
import EditCard from "@/components/admin/ui/EditCard.js";
import Toggle from "@/components/admin/ui/Toggle.js";
import ChipPicker from "@/components/admin/ui/ChipPicker.js";
import ConfirmButton from "@/components/admin/ui/ConfirmButton.js";
import { requireAdmin } from "@/lib/auth.js";
import {
  saveBusiness,
  saveVisibility,
  saveSuites,
  saveRent,
  makeLink,
  emailLink,
  removeTenant,
} from "../actions.js";
import { tenantStatus, tenantPhoto, initials } from "../shared.js";

const APP_URL = process.env.APP_URL || "";

export function generateMetadata({ params }) {
  const t = getDirectoryEntry(Number(params.id));
  return { title: t ? t.business_name : "Directory" };
}

function Row({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <span className="shrink-0 text-ink-muted">{label}</span>
      <span className="min-w-0 truncate text-right font-medium text-ink">{children}</span>
    </div>
  );
}

const Empty = ({ children }) => <span className="font-normal text-ink-muted">{children}</span>;

/**
 * One business: who they are, their private link, what they've put on their
 * page, and the owner's settings (suites, website dates, rent) — each a
 * summary until you press Edit.
 */
export default async function TenantPage({ params }) {
  await requireAdmin();
  const id = Number(params.id);
  const t = getDirectoryEntry(id);
  if (!t) notFound();

  const today = venueToday();
  const status = tenantStatus(t, today);
  const photo = tenantPhoto(t);
  const link = t.edit_token ? `${APP_URL}/business-listing/${t.edit_token}` : null;
  const publicUrl = `${APP_URL}/directory/${directorySlug(t)}`;
  const links = parseDirectoryLinks(t);
  let photos = [];
  try {
    photos = JSON.parse(t.photos || "[]").filter(Boolean);
  } catch {
    photos = [];
  }

  const suites = listSuites().filter((s) => !zoneSpace(s.zone));
  const mine = suitesForTenant(id).map((s) => s.id);
  const suiteName = (s) => s.name || s.zone;
  const groups = [
    { title: "Upper floor", list: suites.filter((s) => s.floor !== "lower") },
    { title: "Lower floor", list: suites.filter((s) => s.floor === "lower") },
  ].map((g) => ({
    title: g.title,
    options: g.list.map((s) => {
      const others = tenantsForSuite(s.id).filter((x) => x.id !== id);
      return { value: s.id, label: suiteName(s), note: others.length ? `with ${others.map((x) => x.business_name).join(", ")}` : "" };
    }),
  }));

  const month = today.slice(0, 7);
  const rentPaid = db.prepare("SELECT * FROM rent_payments WHERE directory_id = ? AND month = ?").get(id, month);
  const email = String(t.contact_email || "").trim().toLowerCase();
  const hasAccount = email
    ? !!db.prepare("SELECT 1 FROM accounts WHERE lower(email) = ? AND email_verified_at IS NOT NULL").get(email)
    : false;
  const hidden = { id };

  return (
    <div>
      <PageHeader eyebrow="Directory" title={t.business_name} />

      {/* Who they are */}
      <section className="card mb-6 flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-verde/60">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-2xl font-semibold text-verde-deep">{initials(t.business_name)}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={status.tone}>{status.label}</Badge>
            {mine.length ? (
              suites
                .filter((s) => mine.includes(s.id))
                .map((s) => (
                  <span key={s.id} className="rounded-full bg-paper-warm px-2.5 py-0.5 text-xs font-semibold text-ink-soft">
                    Suite {suiteName(s)}
                  </span>
                ))
            ) : (
              <span className="rounded-full bg-paper-warm px-2.5 py-0.5 text-xs text-ink-muted">No suite</span>
            )}
            {t.shares_staff_cost ? <Badge tone="sky">Shares staff</Badge> : null}
            {hasAccount ? <Badge tone="success">Has an account</Badge> : null}
          </div>
          <p className="mt-2 text-sm text-ink-soft">{t.category || <Empty>No category yet</Empty>}</p>
          {t.contact_email ? (
            <a href={`mailto:${t.contact_email}`} className="mt-1 inline-flex items-center gap-1.5 text-sm text-verde-deep hover:underline">
              <Mail className="h-3.5 w-3.5" aria-hidden="true" />
              {t.contact_email}
            </a>
          ) : null}
        </div>
        {isLiveNow(t) ? (
          <Button href={publicUrl} as="a" target="_blank" rel="noreferrer" variant="ghost" size="sm" icon={Eye}>
            View their page
          </Button>
        ) : null}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-6">
          {/* Their private link */}
          <section className="card p-5">
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">
              <KeyRound className="h-4 w-4" aria-hidden="true" /> Their private link
            </h2>
            <p className="mt-2 text-sm text-ink-soft">
              {t.business_name} uses this to add their photo, description and links. Their changes go live right away.
            </p>
            {link ? (
              <>
                <CopyField url={link} className="mt-3" />
                <form action={emailLink} className="mt-3">
                  <input type="hidden" name="id" value={id} />
                  <Button type="submit" variant="subtle" size="sm" icon={Mail} disabled={!t.contact_email}>
                    {t.contact_email ? `Email it to ${t.contact_email}` : "Add their email to send it"}
                  </Button>
                </form>
              </>
            ) : (
              <form action={makeLink} className="mt-3">
                <input type="hidden" name="id" value={id} />
                <Button type="submit" size="sm">Make their link</Button>
              </form>
            )}
          </section>

          {/* What they've shared */}
          <section className="card p-5">
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">
              <Store className="h-4 w-4" aria-hidden="true" /> On their page
            </h2>
            {t.description ? (
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-soft">{t.description}</p>
            ) : (
              <p className="mt-3 text-sm text-ink-muted">They haven&apos;t written a description yet. Send them their link.</p>
            )}
            {photos.length || t.photo_path ? (
              <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                {[...new Set([t.photo_path, ...photos].filter(Boolean))].map((p) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={p} src={p} alt="" className="h-24 w-32 shrink-0 rounded-lg object-cover" />
                ))}
              </div>
            ) : null}
            {links.length ? (
              <div className="mt-4 space-y-2">
                {links.map((l) => (
                  <div key={l.url}>
                    {l.label ? <p className="mb-1 text-xs font-semibold text-ink-soft">{l.label}</p> : null}
                    <CopyField url={l.url} />
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        </div>

        <div className="space-y-6">
          <EditCard
            title="Business"
            icon={<Building2 className="h-4 w-4" aria-hidden="true" />}
            action={saveBusiness}
            hidden={hidden}
            view={
              <>
                <Row label="Name">{t.business_name}</Row>
                <Row label="Email">{t.contact_email || <Empty>None yet</Empty>}</Row>
              </>
            }
          >
            <div>
              <label className="label" htmlFor="biz-name">Business name</label>
              <input id="biz-name" name="business_name" required defaultValue={t.business_name} className="field" />
            </div>
            <div>
              <label className="label" htmlFor="biz-email">Their email</label>
              <input id="biz-email" name="contact_email" type="email" defaultValue={t.contact_email || ""} placeholder="owner@shop.com" className="field" />
            </div>
          </EditCard>

          <EditCard
            title="Suites"
            icon={<Users className="h-4 w-4" aria-hidden="true" />}
            action={saveSuites}
            hidden={hidden}
            view={
              mine.length ? (
                <div className="flex flex-wrap gap-2">
                  {suites
                    .filter((s) => mine.includes(s.id))
                    .map((s) => (
                      <span key={s.id} className="rounded-full bg-ink px-3 py-1 text-sm font-semibold text-paper">
                        {suiteName(s)}
                      </span>
                    ))}
                </div>
              ) : (
                <p className="text-sm text-ink-muted">Not in a suite. Tap Edit to pick one.</p>
              )
            }
          >
            <ChipPicker name="suite_ids" groups={groups} defaultSelected={mine} />
            <p className="text-xs text-ink-muted">Two businesses can share a suite. Each keeps its own page.</p>
          </EditCard>

          <EditCard
            title="On the website"
            icon={<CalendarRange className="h-4 w-4" aria-hidden="true" />}
            action={saveVisibility}
            hidden={hidden}
            view={
              <>
                <Row label="Showing">
                  <Badge tone={status.tone}>{status.label}</Badge>
                </Row>
                <Row label="From">{t.active_from ? formatDateShort(t.active_from) : <Empty>Any time</Empty>}</Row>
                <Row label="Until">{t.active_until ? formatDateShort(t.active_until) : <Empty>No end date</Empty>}</Row>
              </>
            }
          >
            <Toggle name="active" defaultChecked={Number(t.active) === 1} label="Show on the website" hint="Their page and their spot on the floor map." />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="biz-from">From</label>
                <input id="biz-from" name="active_from" type="date" defaultValue={t.active_from || ""} className="field" />
              </div>
              <div>
                <label className="label" htmlFor="biz-until">Until</label>
                <input id="biz-until" name="active_until" type="date" defaultValue={t.active_until || ""} className="field" />
              </div>
            </div>
            <p className="text-xs text-ink-muted">Leave the dates blank to show them for as long as they&apos;re switched on.</p>
          </EditCard>

          <EditCard
            title="Rent"
            icon={<Receipt className="h-4 w-4" aria-hidden="true" />}
            action={saveRent}
            hidden={hidden}
            view={
              t.rent_amount || t.rent_link ? (
                <div className="space-y-3">
                  <Row label="Monthly">{t.rent_amount ? formatMoney(t.rent_amount) : <Empty>Not set</Empty>}</Row>
                  <Row label="This month">
                    {rentPaid ? (
                      <Badge tone="success">Paid {formatDateShort(rentPaid.received_on)}</Badge>
                    ) : (
                      <Badge tone="warning">Not paid yet</Badge>
                    )}
                  </Row>
                  {t.rent_link ? (
                    <div>
                      <p className="mb-1 text-xs text-ink-muted">Their pay link</p>
                      <CopyField url={t.rent_link} />
                    </div>
                  ) : (
                    <p className="text-xs text-ink-muted">No pay link yet. Add one so a “Pay rent” button shows on their account.</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-ink-muted">No rent set. Add the amount and their pay link so they can pay from their account.</p>
              )
            }
          >
            <div>
              <label className="label" htmlFor="biz-rent">Monthly rent</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-muted">$</span>
                <input id="biz-rent" name="rent_amount" inputMode="decimal" defaultValue={t.rent_amount ?? ""} placeholder="0.00" className="field pl-7" />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="biz-rent-link">Pay link</label>
              <input id="biz-rent-link" name="rent_link" type="url" defaultValue={t.rent_link || ""} placeholder="https://square.link/…" className="field" />
              <p className="mt-1 text-xs text-ink-muted">A Square payment link or their recurring invoice. Shows as “Pay rent” on their account.</p>
            </div>
          </EditCard>

          <section className="rounded-2xl border border-rust/20 p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-rust">Remove</h2>
            <p className="mt-2 text-sm text-ink-soft">
              Takes {t.business_name} off the website and the floor map, and frees their suites.
            </p>
            <form action={removeTenant} className="mt-3">
              <input type="hidden" name="id" value={id} />
              <ConfirmButton
                label="Remove this business"
                variant="danger"
                confirmLabel={`Yes, remove ${t.business_name}`}
                pendingLabel="Removing…"
                question={`Remove ${t.business_name} from the directory? This can't be undone.`}
              />
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}

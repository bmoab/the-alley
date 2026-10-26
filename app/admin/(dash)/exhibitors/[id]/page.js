import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarRange, Eye, Handshake, KeyRound, Mail, PackageOpen, PackagePlus, Palette, Store, UserRound, Wallet } from "lucide-react";
import { getExhibitor, parseExhibitorLinks } from "@/lib/catalog.js";
import { REMINDERS, makerForExhibitor } from "@/lib/agreement-reminders.js";
import { listVendors, listItems, listSales, listDropoffs, consignorBalances, payoutCutoff, splitFor } from "@/lib/inventory.js";
import { db } from "@/lib/db.js";
import { formatDateShort, formatMoney, venueDayOf } from "@/lib/constants.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import Badge from "@/components/admin/ui/Badge.js";
import Button from "@/components/admin/ui/Button.js";
import CopyField from "@/components/admin/ui/CopyField.js";
import EditCard from "@/components/admin/ui/EditCard.js";
import Toggle from "@/components/admin/ui/Toggle.js";
import Select from "@/components/admin/ui/Select.js";
import ConfirmButton from "@/components/admin/ui/ConfirmButton.js";
import { requireAdmin } from "@/lib/auth.js";
import { saveArtist, saveOnView, saveShop, startSelling, makeLink, emailLink, removeExhibitor } from "../actions.js";
import { exhibitorStatus, exhibitorPhoto, agreementState, initials } from "../shared.js";

const APP_URL = process.env.APP_URL || "";

export function generateMetadata({ params }) {
  const ex = getExhibitor(Number(params.id));
  return { title: ex ? ex.name : "Exhibitors" };
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
 * One artist: who they are, their agreement, their private link, what
 * they've put on their page, and the owner's settings (dates, shop link) —
 * each a summary until you press Edit.
 */
export default async function ExhibitorPage({ params }) {
  await requireAdmin();
  const id = Number(params.id);
  const ex = getExhibitor(id);
  if (!ex) notFound();

  const status = exhibitorStatus(ex);
  const photo = exhibitorPhoto(ex);
  const agreement = agreementState(ex);
  const maker = makerForExhibitor(ex);
  const makers = listVendors();
  const link = ex.edit_token ? `${APP_URL}/exhibitor/${ex.edit_token}` : null;
  const links = parseExhibitorLinks(ex);
  const photos = [...new Set([ex.profile_photo, ...(ex.works || []).map((w) => w.image_path)].filter(Boolean))];
  const email = String(ex.contact_email || "").trim().toLowerCase();
  const hasAccount = email
    ? !!db.prepare("SELECT 1 FROM accounts WHERE lower(email) = ? AND email_verified_at IS NOT NULL").get(email)
    : false;
  const hidden = { id };
  // Their art for sale: the same consignment as a maker's, through their maker record.
  const selling = maker?.is_active
    ? (() => {
        const cutoff = payoutCutoff();
        return {
          onWall: listItems({ vendorId: maker.id, status: "all" }).reduce((t, i) => t + Math.max(0, i.qty_on_hand), 0),
          sold: listSales({ vendorId: maker.id, kind: "retail" }).reduce((t, l) => t + Number(l.qty), 0),
          due: consignorBalances({ through: cutoff })[maker.id]?.owed || 0,
          cutoff,
          waiting: listDropoffs({ vendorId: maker.id, status: "submitted" }),
          split: splitFor(null, maker),
        };
      })()
    : null;

  return (
    <div>
      <PageHeader eyebrow="Exhibitors" title={ex.name} />

      {/* Who they are */}
      <section className="card mb-6 flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-verde/60">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-2xl font-semibold text-verde-deep">{initials(ex.name)}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={status.tone}>{status.label}</Badge>
            {hasAccount ? <Badge tone="success">Has an account</Badge> : null}
            {maker ? (
              <Link href={`/admin/vendors/${maker.id}`} className="transition hover:opacity-80">
                <Badge tone="sky">Maker: {maker.name} →</Badge>
              </Link>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-ink-soft">{ex.discipline || <Empty>No discipline yet</Empty>}</p>
          {ex.contact_email ? (
            <a href={`mailto:${ex.contact_email}`} className="mt-1 inline-flex items-center gap-1.5 text-sm text-verde-deep hover:underline">
              <Mail className="h-3.5 w-3.5" aria-hidden="true" />
              {ex.contact_email}
            </a>
          ) : null}
        </div>
        {status.key !== "hidden" ? (
          <Button href="/exhibitors" as="a" target="_blank" rel="noreferrer" variant="ghost" size="sm" icon={Eye}>
            View the Exhibitors page
          </Button>
        ) : null}
      </section>

      {/* Their agreement and its reminders */}
      {agreement.endsOn ? (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-paper-warm px-4 py-3 text-sm">
          <span className="font-semibold text-ink">
            Agreement {status.key === "past" ? "ended" : "ends"} {formatDateShort(agreement.endsOn)}
          </span>
          {agreement.history.map((h) => (
            <span key={h.id} className="text-ink-soft">
              {REMINDERS[h.kind]?.label || h.kind}: {h.skipped ? "Handled without email" : "Sent"} {formatDateShort(venueDayOf(h.sent_at))}
            </span>
          ))}
          {agreement.due ? (
            <Button href={agreement.href} size="sm" variant="accent" className="sm:ml-auto">
              Send the {agreement.dueLabel}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-6">
          {/* Their private link */}
          <section className="card p-5">
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">
              <KeyRound className="h-4 w-4" aria-hidden="true" /> Their private link
            </h2>
            <p className="mt-2 text-sm text-ink-soft">
              {ex.name} uses this to add their bio, a portrait and photos of their work
              {selling ? ", and to list art for sale and see their sales and payouts" : ""}. Their changes go live right away.
            </p>
            {link ? (
              <>
                <CopyField url={link} className="mt-3" />
                <form action={emailLink} className="mt-3">
                  <input type="hidden" name="id" value={id} />
                  <Button type="submit" variant="subtle" size="sm" icon={Mail} disabled={!ex.contact_email}>
                    {ex.contact_email ? `Email it to ${ex.contact_email}` : "Add their email to send it"}
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

          {/* Their art for sale */}
          <section id="selling" className={selling ? "card p-5" : "card border-verde-deep/40 p-5"}>
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">
              <Store className="h-4 w-4" aria-hidden="true" /> Selling their art
            </h2>
            {selling ? (
              <>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-paper-warm px-3 py-2.5">
                    <p className="text-xl font-semibold tabular-nums text-ink">{selling.onWall}</p>
                    <p className="text-xs text-ink-muted">In the gallery</p>
                  </div>
                  <div className="rounded-xl bg-paper-warm px-3 py-2.5">
                    <p className="text-xl font-semibold tabular-nums text-ink">{selling.sold}</p>
                    <p className="text-xs text-ink-muted">Sold</p>
                  </div>
                  <div className={selling.due ? "rounded-xl bg-verde/50 px-3 py-2.5" : "rounded-xl bg-paper-warm px-3 py-2.5"}>
                    <p className="text-xl font-semibold tabular-nums text-ink">{formatMoney(selling.due)}</p>
                    <p className="text-xs text-ink-muted">Due now</p>
                  </div>
                </div>
                <p className="mt-3 text-sm text-ink-soft">
                  {selling.split}% of each sale goes to them, paid monthly. They list art for sale, and see their sales and
                  payouts, on the Sales &amp; payouts tab of their private link.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button href={`/admin/vendors/${maker.id}`} size="sm" variant="accent" icon={Wallet}>
                    Sales, payouts and pieces
                  </Button>
                  {selling.waiting.length ? (
                    <Button href={`/admin/inventory/receive?dropoff=${selling.waiting[0].id}`} size="sm" variant="ghost" icon={PackageOpen}>
                      Count in their drop-off ({selling.waiting[0].units})
                    </Button>
                  ) : (
                    <Button href={`/admin/inventory/receive?vendor=${maker.id}`} size="sm" variant="ghost" icon={PackagePlus}>
                      Receive art from them
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm text-ink-soft">
                  Selling their work in the shop? Start here. They get everything a maker has: list pieces for sale on their
                  private link, price tags with barcodes, the register, their sales and a monthly payout.
                </p>
                <form action={startSelling} className="mt-3">
                  <input type="hidden" name="id" value={id} />
                  <Button type="submit" size="sm" variant="accent" icon={Store}>
                    Start selling their art
                  </Button>
                </form>
                <p className="mt-2 text-xs text-ink-muted">
                  Already a maker under another name? Link them under In the shop instead.
                </p>
              </>
            )}
          </section>

          {/* What they've shared */}
          <section className="card p-5">
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">
              <Palette className="h-4 w-4" aria-hidden="true" /> On their page
            </h2>
            {ex.blurb ? (
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-soft">{ex.blurb}</p>
            ) : (
              <p className="mt-3 text-sm text-ink-muted">They haven&apos;t written a bio yet. Send them their link.</p>
            )}
            {photos.length ? (
              <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                {photos.map((p) => (
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
            title="Artist"
            icon={<UserRound className="h-4 w-4" aria-hidden="true" />}
            action={saveArtist}
            hidden={hidden}
            view={
              <>
                <Row label="Name">{ex.name}</Row>
                <Row label="Email">{ex.contact_email || <Empty>None yet</Empty>}</Row>
              </>
            }
          >
            <div>
              <label className="label" htmlFor="ex-name">Name</label>
              <input id="ex-name" name="name" required defaultValue={ex.name} className="field" />
            </div>
            <div>
              <label className="label" htmlFor="ex-email">Their email</label>
              <input id="ex-email" name="contact_email" type="email" defaultValue={ex.contact_email || ""} placeholder="artist@email.com" className="field" />
            </div>
          </EditCard>

          <EditCard
            title="On view"
            icon={<CalendarRange className="h-4 w-4" aria-hidden="true" />}
            action={saveOnView}
            hidden={hidden}
            view={
              <>
                <Row label="Showing">
                  <Badge tone={status.tone}>{status.label}</Badge>
                </Row>
                <Row label="On view from">{ex.active_from ? formatDateShort(ex.active_from) : <Empty>Any time</Empty>}</Row>
                <Row label="Agreement ends">{agreement.endsOn ? formatDateShort(agreement.endsOn) : <Empty>No end date</Empty>}</Row>
                <Row label="Order on the page">{ex.sort_order || 0}</Row>
              </>
            }
          >
            <Toggle name="active" defaultChecked={Number(ex.active) === 1} label="Show on the Exhibitors page" hint="Switched off, they're hidden everywhere on the website." />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="ex-from">On view from</label>
                <input id="ex-from" name="active_from" type="date" defaultValue={ex.active_from || ""} className="field" />
              </div>
              <div>
                <label className="label" htmlFor="ex-until">Agreement ends</label>
                <input id="ex-until" name="active_until" type="date" defaultValue={agreement.endsOn || ex.active_until || ""} className="field" />
              </div>
            </div>
            <div className="w-40">
              <label className="label" htmlFor="ex-order">Order on the page</label>
              <input id="ex-order" name="sort_order" type="number" defaultValue={ex.sort_order ?? 0} className="field" />
            </div>
            <p className="text-xs text-ink-muted">
              A month and a week before the agreement ends, the Dashboard asks someone to send a reminder. After that date they
              move to Past. Lower numbers show first.
            </p>
          </EditCard>

          <EditCard
            title="In the shop"
            icon={<Handshake className="h-4 w-4" aria-hidden="true" />}
            action={saveShop}
            hidden={hidden}
            view={
              maker ? (
                <Row label="Sells as">
                  <Link href={`/admin/vendors/${maker.id}`} className="text-verde-deep hover:underline">
                    {maker.name}
                  </Link>
                </Row>
              ) : (
                <p className="text-sm text-ink-muted">Not a maker in the shop.</p>
              )
            }
          >
            <div>
              <label className="label" htmlFor="ex-maker">Also sells in the shop as</label>
              <Select id="ex-maker" name="vendor_id" defaultValue={String(maker?.id || "")}>
                <option value="">Not a maker in the shop</option>
                {makers.map((m) => (
                  <option key={m.id} value={String(m.id)}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </div>
            <p className="text-xs text-ink-muted">
              Linked, their consignment and this listing share one agreement and one end date, and they get one reminder.
            </p>
          </EditCard>

          <section className="rounded-2xl border border-rust/20 p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-rust">Remove</h2>
            <p className="mt-2 text-sm text-ink-soft">
              Takes {ex.name} and their photos off the website. To keep them in the Past archive instead, leave them be.
            </p>
            <form action={removeExhibitor} className="mt-3">
              <input type="hidden" name="id" value={id} />
              <ConfirmButton
                label="Remove this exhibitor"
                variant="danger"
                confirmLabel={`Yes, remove ${ex.name}`}
                pendingLabel="Removing…"
                question={`Remove ${ex.name} and their photos? This can't be undone.`}
              />
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import { Plus, UserPlus } from "lucide-react";
import Dialog from "@/components/admin/ui/Dialog.js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { listBookings } from "@/lib/bookings.js";
import { releaseExpiredHolds } from "@/lib/payments.js";
import { listAllEvents, listingIndex, listDirectory, eventLastDate } from "@/lib/catalog.js";
import { listClosures, createClosure, deleteClosure } from "@/lib/closures.js";
import { adminCalendarItems, closedDateMarkers, SPACE_LABEL } from "@/lib/calendar-items.js";
import { getCurrentUser, canManageBookings, requireAdmin } from "@/lib/auth.js";
import {
  venueDayOf,
  SPACES,
  BOOKABLE_SPACES,
  DATE_PRESETS,
  DEFAULT_DATE_PRESET,
  resolveDateRange,
  spaceName,
  formatDate,
  formatDateShort,
  formatTime,
  formatMoney,
  upperFirst,
} from "@/lib/constants.js";
import { eventTimeLabel } from "@/lib/event-time.js";
import AdminCalendar from "@/components/AdminCalendar.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import Card from "@/components/admin/ui/Card.js";
import Badge from "@/components/admin/ui/Badge.js";
import Button from "@/components/admin/ui/Button.js";
import BookingActionsMenu from "@/components/admin/BookingActionsMenu.js";
import { DataTable, Td } from "@/components/admin/ui/DataTable.js";
import LinkRow from "@/components/admin/ui/LinkRow.js";
import { cx } from "@/components/admin/ui/cx.js";
import ListingPanel, { NewEventForm } from "./ListingPanel.js";
import { createEvent, inviteHost } from "./listing-actions.js";
import {
  markPaid,
  keepOnCalendar,
  setBookingPublic,
  sendRescheduleLink,
  resend,
  checkPayment,
  restore,
  archive,
} from "./booking-actions.js";
import Select from "@/components/admin/ui/Select.js";

export const metadata = { title: "Events" };
export const dynamic = "force-dynamic";

/**
 * Events — ONE page for everything on the calendar. It used to be three
 * (Bookings, Calendar, Public Events), and the same evening's details were
 * split between them: the room and the money on one, what guests see on
 * another. Now the calendar sits on top, every booking AND every listing is in
 * one filterable list under it, and anything opens in a side panel on this
 * page: ?b=<id> for a booking (the drawer in the dash layout, which links its
 * listing), ?ev=<id> for a listing (ListingPanel, which links its booking).
 */

// Booking status filters. "active" (the default) and "all" are meta-filters;
// "archived" is the junk drawer. Listings with no booking only show under
// Active and All — the other filters are about a booking's state.
const FILTERS = [
  { key: "active", label: "Active" },
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "held", label: "Held" },
  { key: "reserved", label: "Reserved" },
  { key: "confirmed", label: "Confirmed" },
  { key: "completed", label: "Completed" },
  { key: "denied", label: "Denied" },
  { key: "cancelled", label: "Cancelled" },
  { key: "expired", label: "Expired" },
  { key: "archived", label: "Archived" },
];

// Filters about the past default to "All time" rather than "Upcoming".
const HISTORICAL_STATUSES = new Set(["archived", "cancelled", "denied", "expired", "completed"]);
// Over and done with — left out of "Active".
const DEAD_STATUSES = new Set(["denied", "cancelled", "expired"]);
const ACTIVE_STATUSES = FILTERS.map((f) => f.key).filter(
  (k) => !["active", "all", "archived"].includes(k) && !DEAD_STATUSES.has(k)
);
const DEFAULT_STATUS = "active";

const SHOW = [
  { key: "", label: "Everything" },
  { key: "booked", label: "Bookings" },
  { key: "listings", label: "Listings only (no booking)" },
];
const PUB = [
  { key: "", label: "Either" },
  { key: "public", label: "Public" },
  { key: "private", label: "Not public" },
  { key: "none", label: "No listing" },
];

// A listing's state, as the list shows it.
const LISTING_STATE = {
  live: { label: "Public", className: "bg-verde/60 text-ink-soft" },
  private: { label: "Private", className: "bg-ink/5 text-ink-soft" },
  pending: { label: "Review", className: "bg-gold/25 text-ink" },
  draft: { label: "Waiting on host", className: "bg-ink/5 text-ink-muted" },
};

function ListingTag({ status }) {
  const s = LISTING_STATE[status];
  if (!s) return <span className="text-xs text-ink-muted">—</span>;
  return <span className={cx("whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", s.className)}>{s.label}</span>;
}

async function addClosure(formData) {
  "use server";
  await requireAdmin();
  const allDay = formData.get("all_day") != null;
  createClosure({
    space: (formData.get("space") || "all").toString(),
    start_date: (formData.get("start_date") || "").toString(),
    end_date: (formData.get("end_date") || "").toString(),
    start_time: allDay ? null : (formData.get("start_time") || "").toString() || null,
    end_time: allDay ? null : (formData.get("end_time") || "").toString() || null,
    reason: (formData.get("reason") || "").toString(),
  });
  revalidatePath("/admin/events");
  revalidatePath("/spaces");
  revalidatePath("/book");
  redirect("/admin/events?toast=" + encodeURIComponent("Closure added.") + "&toastType=success#closures");
}

async function removeClosure(formData) {
  "use server";
  await requireAdmin();
  deleteClosure(Number(formData.get("id")));
  revalidatePath("/admin/events");
  revalidatePath("/spaces");
  revalidatePath("/book");
  redirect("/admin/events#closures");
}

export default async function EventsPage({ searchParams }) {
  await requireAdmin();
  const canManage = canManageBookings(await getCurrentUser());

  // Lazy sweep: release any holds whose payment window has lapsed (a cron does
  // this in production too). Notifies affected clients.
  await releaseExpiredHolds();

  const sp = searchParams || {};
  const status = (sp.status || DEFAULT_STATUS).toString();
  const sort = sp.sort === "date_desc" ? "date_desc" : "date_asc";
  const q = (sp.q || "").toString().trim();
  const space = (sp.space || "").toString();
  const show = ["booked", "listings"].includes(sp.show) ? sp.show : "";
  const pub = ["public", "private", "none"].includes(sp.pub) ? sp.pub : "";
  const day = /^\d{4}-\d{2}-\d{2}$/.test(sp.day || "") ? sp.day : "";
  const customFrom = (sp.from || "").toString();
  const customTo = (sp.to || "").toString();
  const focusedId = (sp.focus || sp.b || "").toString();
  const openListing = (sp.ev || "").toString();

  const explicitPreset = (sp.preset || "").toString();
  const showsAllByDefault = HISTORICAL_STATUSES.has(status) || status === "held";
  const defaultPreset = showsAllByDefault ? "all" : DEFAULT_DATE_PRESET;
  const preset = explicitPreset || defaultPreset;
  // A day picked on the calendar wins over the date range.
  const range = day ? { from: day, to: day } : resolveDateRange(preset, { from: customFrom, to: customTo });
  const archived = status === "archived";

  // URL for this view with some params changed ("" removes one).
  const current = { status, sort, q, space, show, pub, day, preset: explicitPreset, from: customFrom, to: customTo };
  const qs = (next = {}) => {
    const m = { ...current, ...next };
    const p = new URLSearchParams();
    if (m.status && m.status !== DEFAULT_STATUS) p.set("status", m.status);
    if (m.sort && m.sort !== "date_asc") p.set("sort", m.sort);
    for (const k of ["q", "space", "show", "pub", "day", "preset"]) if (m[k]) p.set(k, m[k]);
    if (m.preset === "custom") {
      if (m.from) p.set("from", m.from);
      if (m.to) p.set("to", m.to);
    }
    for (const k of ["b", "ev"]) if (m[k]) p.set(k, m[k]);
    const s = p.toString();
    return "/admin/events" + (s ? `?${s}` : "");
  };

  // ── Listings, keyed so a booking row can show its own ────────────────────
  const { byBooking, bySeries } = listingIndex();
  const listingFor = (b) => byBooking[b.id] || (b.series_id != null ? bySeries[b.series_id] : null);
  const needle = q.toLowerCase();
  const matches = (...fields) => !needle || fields.some((f) => String(f || "").toLowerCase().includes(needle));
  const pubMatches = (listingStatus) =>
    !pub ||
    (pub === "public" && listingStatus === "live") ||
    (pub === "private" && listingStatus && listingStatus !== "live") ||
    (pub === "none" && !listingStatus);

  // ── Booking rows ──────────────────────────────────────────────────────────
  const bookingRows =
    show === "listings"
      ? []
      : listBookings({
          status: archived || status === "all" ? undefined : status === "active" ? ACTIVE_STATUSES : status,
          sort,
          space: space || undefined,
          from: range.from || undefined,
          to: range.to || undefined,
          archived,
        })
          .map((b) => ({ type: "booking", date: b.date, time: b.start_time, booking: b, listing: listingFor(b) }))
          .filter((r) => matches(r.booking.client_name, r.booking.client_email, r.booking.event_type, r.listing?.title))
          .filter((r) => pubMatches(r.listing?.status));

  // ── Listing rows: listings with no booking behind them ────────────────────
  // The Alley's own events, special events, tenant posts. Booked listings ride on
  // their booking's row above instead of getting a second one.
  const listingRows =
    show === "booked" || pub === "none" || !["active", "all"].includes(status)
      ? []
      : listAllEvents()
          .filter((e) => !e.booking_id && e.status !== "removed")
          .filter((e) => !space || e.space === space)
          .filter((e) => {
            // A listing counts while any of its dates is in range; an undated
            // invite only shows when the range is open-ended.
            if (!e.date) return !range.to;
            const last = eventLastDate(e) || e.date;
            return (!range.from || last >= range.from) && (!range.to || e.date <= range.to);
          })
          .filter((e) => matches(e.title, e.host_name, e.host_email))
          .filter((e) => pubMatches(e.status))
          .map((e) => ({ type: "listing", date: e.date || "", time: e.time, event: e }));

  const rows = [...bookingRows, ...listingRows].sort((a, b) => {
    const ka = `${a.date || "9999"} ${a.time || ""}`;
    const kb = `${b.date || "9999"} ${b.time || ""}`;
    return sort === "date_desc" ? kb.localeCompare(ka) : ka.localeCompare(kb);
  });

  // ── Needs attention ───────────────────────────────────────────────────────
  const allListings = listAllEvents();
  const toReview = allListings.filter((e) => e.status === "pending");
  const waitingOnHosts = allListings.filter((e) => e.status === "draft");
  const pendingRequests = listBookings({ status: "pending" }).length;

  const tenantName = Object.fromEntries(listDirectory().map((t) => [t.id, t.business_name]));
  const otherSort = sort === "date_asc" ? "date_desc" : "date_asc";
  const presetLabel = DATE_PRESETS.find((p) => p.key === preset)?.label || "Upcoming";
  const isFiltered = q || space || show || pub || day || (explicitPreset && explicitPreset !== defaultPreset);
  const filterValues = { status, sort, q, space, show, pub, day, preset, from: customFrom, to: customTo };
  const closures = listClosures();

  return (
    <div>
      <PageHeader
        title="Events"
        subtitle="Everything on the calendar in one place — bookings, The Alley's own events and hosts' listings. Tap anything for all of its details."
        actions={
          // Keyed on the open listing: creating one lands on its panel, and
          // the dialog behind it starts closed and empty again.
          <div className="flex flex-wrap gap-2" key={`new-${openListing || "x"}`}>
            <Dialog
              title="Add a special event"
              width={600}
              trigger={
                <>
                  <UserPlus className="h-4 w-4" aria-hidden="true" /> Special event
                </>
              }
              triggerClassName="inline-flex h-10 items-center gap-2 rounded-xl border border-line-strong bg-paper px-4 text-sm font-semibold text-ink transition hover:bg-paper-dim"
            >
          <div className="rounded-xl bg-paper-warm p-3 text-sm text-ink-soft">
            <p>
              <strong className="text-ink">For someone else&apos;s event that isn&apos;t a room rental</strong> — a partner,
              a local group, a performer. You add their name and email; we email them a private link where they fill in
              the title, photo, description and how guests pay. With a date, it goes on the public calendar right away as a
              placeholder until they do.
            </p>
            <p className="mt-2">
              <strong className="text-ink">It doesn&apos;t reserve a room.</strong> If they&apos;ll use one, make a booking
              (or close the room) for that night too. Tenants don&apos;t need this — they post their own events from their
              business page.
            </p>
          </div>
          <form action={inviteHost} className="mt-4 grid grid-cols-1 gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div><label className="label">Who&apos;s putting it on</label><input name="host_name" required placeholder="Jane Maker" className="field" /></div>
              <div><label className="label">Their email (we send them the link)</label><input name="host_email" type="email" placeholder="host@email.com" className="field" /></div>
            </div>
            <div><label className="label">Event title (optional)</label><input name="title" placeholder="e.g. Saturday Improv Night" className="field" /></div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div><label className="label">Event date (optional)</label><input name="date" type="date" className="field" /></div>
              <div><label className="label">Through (optional, multi-day)</label><input name="active_until" type="date" className="field" /></div>
            </div>
            <Button type="submit" className="w-fit">Add it &amp; email them</Button>
          </form>
            </Dialog>
            <Dialog
              title="New Alley event"
              width={680}
              trigger={
                <>
                  <Plus className="h-4 w-4" aria-hidden="true" /> New Alley event
                </>
              }
              triggerClassName="inline-flex h-10 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-paper transition hover:bg-ink-soft"
            >
              <NewEventForm createEvent={createEvent} />
            </Dialog>
          </div>
        }
      />

      {/* Needs you */}
      {toReview.length || pendingRequests || waitingOnHosts.length ? (
        <div className="mb-4 flex flex-wrap gap-2 text-sm">
          {pendingRequests ? (
            <Link href="/admin/requests" className="rounded-full border border-gold/50 bg-gold/15 px-3 py-1.5 font-semibold text-ink hover:bg-gold/25">
              {pendingRequests} booking request{pendingRequests === 1 ? "" : "s"} to answer →
            </Link>
          ) : null}
          {toReview.map((e) => (
            <Link
              key={e.id}
              href={qs({ ev: String(e.id) })}
              scroll={false}
              className="rounded-full border border-gold/50 bg-gold/15 px-3 py-1.5 font-semibold text-ink hover:bg-gold/25"
            >
              Review: {e.title || e.host_name || "listing"} →
            </Link>
          ))}
          {waitingOnHosts.length ? (
            <Link
              href={qs({ show: "listings", pub: "private", status: "all", preset: "all", day: "" })}
              className="rounded-full border border-line px-3 py-1.5 font-semibold text-ink-soft hover:bg-paper-dim"
            >
              {waitingOnHosts.length} special event{waitingOnHosts.length === 1 ? "" : "s"} waiting on the host
            </Link>
          ) : null}
        </div>
      ) : null}

      {/* The calendar — a week on a phone, the month on a computer */}
      <div className="mb-6">
        <AdminCalendar
          items={adminCalendarItems()}
          closedDates={closedDateMarkers(closures)}
          collapsible
          dayHrefPrefix="/admin/events?status=all&day="
          selectedDay={day || null}
        />
      </div>

      {day ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-verde-deep/30 bg-verde/30 px-4 py-2.5 text-sm">
          <span className="font-semibold text-ink">Showing {formatDate(day)}</span>
          <Link href={qs({ day: "", status: "" })} className="font-semibold text-verde-deep hover:underline">
            Show everything again
          </Link>
        </div>
      ) : null}

      {/* Status filter */}
      <div className="mb-4 flex flex-wrap gap-1 rounded-2xl border border-line bg-paper p-1">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={qs({ status: f.key })}
            className={cx(
              "rounded-full px-3.5 py-1.5 text-sm font-semibold transition",
              status === f.key ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper-dim hover:text-ink"
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {/* Search + what + public + space + dates */}
      <form method="get" className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-6 lg:items-end">
        {status !== DEFAULT_STATUS ? <input type="hidden" name="status" value={status} /> : null}
        {sort !== "date_asc" ? <input type="hidden" name="sort" value={sort} /> : null}
        <div className="col-span-2">
          <label className="label" htmlFor="q">Search</label>
          <input id="q" name="q" defaultValue={q} className="field" placeholder="Event, client, host or email" />
        </div>
        <div>
          <label className="label" htmlFor="show">Show</label>
          <Select id="show" name="show" defaultValue={show} submitOnChange>
            {SHOW.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </Select>
        </div>
        <div>
          <label className="label" htmlFor="pub">Public?</label>
          <Select id="pub" name="pub" defaultValue={pub} submitOnChange>
            {PUB.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </Select>
        </div>
        <div>
          <label className="label" htmlFor="space">Space</label>
          <Select id="space" name="space" defaultValue={space} submitOnChange>
            <option value="">All spaces</option>
            {SPACES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>
        <div>
          <label className="label" htmlFor="preset">Dates</label>
          <Select id="preset" name="preset" defaultValue={preset} submitOnChange>
            {DATE_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </Select>
        </div>
        {preset === "custom" ? (
          <>
            <div>
              <label className="label" htmlFor="from">From</label>
              <input id="from" name="from" type="date" defaultValue={customFrom} className="field" />
            </div>
            <div>
              <label className="label" htmlFor="to">To</label>
              <input id="to" name="to" type="date" defaultValue={customTo} className="field" />
            </div>
          </>
        ) : null}
        <div className="col-span-2 flex gap-2 lg:col-span-1">
          <Button type="submit" variant="ghost">Filter</Button>
          {isFiltered ? (
            <Button href={qs({ q: "", space: "", show: "", pub: "", day: "", preset: "", from: "", to: "" })} variant="subtle">
              Clear
            </Button>
          ) : null}
        </div>
      </form>

      {rows.length === 0 ? (
        <Card pad="lg" className="py-12 text-center text-ink-muted">
          {archived ? "Nothing archived." : `Nothing matches${day ? "" : preset !== "all" ? ` in “${presetLabel}”` : ""}.`}
          {!day && preset !== "all" && !archived ? (
            <div className="mt-2 text-sm">
              <Link href={qs({ preset: "all" })} className="font-medium text-verde-deep hover:underline">
                Search all time instead →
              </Link>
            </div>
          ) : null}
          {status === "active" ? (
            <div className="mt-2 text-sm">
              <Link href={qs({ status: "all" })} className="font-medium text-verde-deep hover:underline">
                Include denied &amp; cancelled →
              </Link>
            </div>
          ) : null}
        </Card>
      ) : (
        <>
        {/* Phone: one card per evening — a seven-column table doesn't fit. */}
        <ul className="space-y-2 sm:hidden">
          {rows.map((r) =>
            r.type === "booking" ? (
              <PhoneBookingCard
                key={`pb-${r.booking.id}`}
                b={r.booking}
                listing={r.listing}
                href={qs({ b: String(r.booking.id) })}
                focused={String(r.booking.id) === focusedId}
                canManage={canManage}
                filters={filterValues}
              />
            ) : (
              <PhoneListingCard key={`pe-${r.event.id}`} e={r.event} href={qs({ ev: String(r.event.id) })} />
            )
          )}
        </ul>
        <Card pad="sm" className="hidden sm:block">
          <DataTable
            columns={[
              <Link key="d" href={qs({ sort: otherSort })} className="inline-flex items-center gap-1 hover:text-ink">
                Date {sort === "date_asc" ? "↑" : "↓"}
              </Link>,
              "Event",
              "Space",
              "Status",
              "Public",
              "Payment",
              "Total",
              "",
            ]}
            minWidth={720}
            // Pin the last column to the right edge: the table scrolls sideways
            // on a phone, which otherwise parks every row action off-screen.
            className="[&_tr>*:last-child]:sticky [&_tr>*:last-child]:right-0 [&_tr>*:last-child]:z-10 [&_tr>*:last-child]:bg-paper [&_tr>*:last-child]:shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.08)]"
          >
            {rows.map((r) =>
              r.type === "booking" ? (
                <BookingRow
                  key={`b-${r.booking.id}`}
                  b={r.booking}
                  listing={r.listing}
                  href={qs({ b: String(r.booking.id) })}
                  focused={String(r.booking.id) === focusedId}
                  tenant={r.booking.tenant_id ? tenantName[r.booking.tenant_id] : null}
                  canManage={canManage}
                  filters={filterValues}
                />
              ) : (
                <ListingRow
                  key={`e-${r.event.id}`}
                  e={r.event}
                  href={qs({ ev: String(r.event.id) })}
                  focused={String(r.event.id) === openListing}
                  tenant={r.event.tenant_id ? tenantName[r.event.tenant_id] : null}
                />
              )
            )}
          </DataTable>
        </Card>
        </>
      )}

      {/* Less often: closures and the calendar feed */}
      <details id="closures" className="card mt-8 p-5">
        <summary className="cursor-pointer font-semibold text-ink">
          Close the Alley {closures.length ? <span className="font-normal text-ink-muted">({closures.length} set)</span> : null}
        </summary>
        <p className="mt-2 text-sm text-ink-muted">
          Block new bookings for a space (or the whole building) on a date — all day or for a time window. Existing bookings
          aren&apos;t affected.
        </p>
        <form action={addClosure} className="mt-4 grid grid-cols-1 gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="label">Space</label>
              <Select name="space" defaultValue="all">
                <option value="all">Whole building</option>
                {BOOKABLE_SPACES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </div>
            <div><label className="label">From date</label><input name="start_date" type="date" required className="field" /></div>
            <div><label className="label">To date (optional)</label><input name="end_date" type="date" className="field" /></div>
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="all_day" defaultChecked />
            <span className="text-sm font-semibold text-ink-soft">All day</span>
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div><label className="label">From time (if not all day)</label><input name="start_time" type="time" className="field" /></div>
            <div><label className="label">To time</label><input name="end_time" type="time" className="field" /></div>
            <div><label className="label">Reason (optional)</label><input name="reason" placeholder="Holiday, private event…" className="field" /></div>
          </div>
          <Button type="submit" className="w-fit">Add closure</Button>
        </form>
        {closures.length ? (
          <ul className="mt-5 divide-y divide-line">
            {closures.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="text-ink-soft">
                  <strong className="text-ink">{SPACE_LABEL[c.space] || c.space}</strong> {formatDate(c.start_date)}
                  {c.end_date !== c.start_date ? ` – ${formatDate(c.end_date)}` : ""}
                  {c.start_time && c.end_time ? ` · ${formatTime(c.start_time)}–${formatTime(c.end_time)}` : " · all day"}
                  {c.reason ? ` · ${c.reason}` : ""}
                </span>
                <form action={removeClosure}>
                  <input type="hidden" name="id" value={c.id} />
                  <button className="text-xs font-semibold text-rust hover:underline">Remove</button>
                </form>
              </li>
            ))}
          </ul>
        ) : null}
      </details>

      <details className="card mt-3 p-5">
        <summary className="cursor-pointer font-semibold text-ink">Sync to Google Calendar &amp; Skylight</summary>
        <p className="mt-2 text-sm text-ink-soft">
          Subscribe any calendar to this live feed of your public events (Google Calendar → Other calendars → From URL;
          Skylight → Add calendar → iCal/URL):
        </p>
        <code className="mt-2 block break-all rounded bg-paper-dim p-2 text-xs text-ink-soft">{(process.env.APP_URL || "") + "/calendar.ics"}</code>
        <p className="mt-2 text-xs text-ink-muted">
          Once it&apos;s in Google Calendar, share that calendar with your tenants. Set the &ldquo;Shared calendar link&rdquo;
          under Site Content → Descriptors to include it in invite emails.
        </p>
      </details>

      {openListing ? <ListingPanel id={openListing} closeHref={qs({ ev: "" })} /> : null}
    </div>
  );
}

function BookingRow({ b, listing, href, focused, tenant, canManage, filters }) {
  const dim = b.status === "cancelled" || b.archived;
  const comped = Number(b.total) === 0;
  return (
    <LinkRow href={href} id={`b-${b.id}`} className={cx(dim && "opacity-55", focused && "bg-verde/50 hover:bg-verde/50")}>
      <Td>
        <div className="whitespace-nowrap font-medium text-ink">{formatDateShort(b.date)}</div>
        <div className="text-xs text-ink-muted">
          {formatTime(b.start_time)} · {b.hours}h
        </div>
      </Td>
      <Td>
        <Link href={href} scroll={false} className="group block">
          <span className={cx("font-medium", dim ? "text-ink-soft line-through" : "text-ink group-hover:underline")}>
            {listing?.title || b.event_type || b.client_name}
          </span>
          {listing?.title || b.event_type ? <span className="block text-xs text-ink-soft">{b.client_name}</span> : null}
          <span className="block text-xs text-ink-muted">{b.client_email}</span>
        </Link>
        {tenant ? <div className="text-xs font-medium text-verde-deep">Tenant · {tenant}</div> : null}
        {b.series_id ? (
          <div className="text-xs font-medium text-sky-700">
            Recurring · session {b.series_index}/{b.series_total}
          </div>
        ) : null}
      </Td>
      <Td className="whitespace-nowrap">{spaceName(b.space).replace("The Alley ", "")}</Td>
      <Td>
        <Badge status={b.status} />
        {b.status === "cancelled" && b.refund_type && b.refund_type !== "none" ? (
          <div className="mt-0.5 text-xs text-ink-muted">Refunded {formatMoney(b.refund_amount)}</div>
        ) : null}
      </Td>
      <Td>{listing ? <ListingTag status={listing.status} /> : <ListingTag status="private" />}</Td>
      <Td className="capitalize">
        {comped && b.payment_status === "paid" ? (
          <span className="font-medium text-verde-deep">Free</span>
        ) : (
          b.payment_status || "unpaid"
        )}
        {b.status === "held" && b.keep_on_calendar ? (
          <div className="text-xs normal-case font-medium text-verde-deep">Kept on calendar · won’t expire</div>
        ) : b.status === "held" && b.hold_expires_at ? (
          <div className="text-xs normal-case text-ink-muted">Holds until {formatDate(venueDayOf(b.hold_expires_at))}</div>
        ) : null}
      </Td>
      <Td className="text-right font-medium text-ink">{formatMoney(b.total)}</Td>
      <Td className="text-right">
        {canManage ? (
          <BookingActionsMenu
            booking={b}
            filters={filters}
            markPaidAction={markPaid}
            checkPaymentAction={checkPayment}
            resendAction={resend}
            listing={listing ? { id: listing.id, status: listing.status, host_posted: listing.host_posted } : null}
            setPublicAction={setBookingPublic}
            rescheduleLinkAction={sendRescheduleLink}
            keepOnCalendarAction={keepOnCalendar}
            restoreAction={restore}
            archiveAction={archive}
          />
        ) : (
          <Link href={href} scroll={false} className="whitespace-nowrap text-xs font-semibold text-verde-deep hover:underline">
            Open
          </Link>
        )}
      </Td>
    </LinkRow>
  );
}

function PhoneBookingCard({ b, listing, href, focused, canManage, filters }) {
  const dim = b.status === "cancelled" || b.archived;
  return (
    <li className={cx("card flex items-start gap-3 p-3", dim && "opacity-55", focused && "ring-2 ring-verde-deep")}>
      <Link href={href} scroll={false} className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-ink-muted">
          {formatDateShort(b.date)} · {formatTime(b.start_time)} · {spaceName(b.space).replace("The Alley ", "")}
        </p>
        <p className={cx("mt-0.5 font-semibold", dim ? "text-ink-soft line-through" : "text-ink")}>
          {listing?.title || b.event_type || b.client_name}
        </p>
        <p className="truncate text-xs text-ink-soft">{b.client_name}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Badge status={b.status} />
          {listing ? <ListingTag status={listing.status} /> : <ListingTag status="private" />}
          <span className="text-xs text-ink-muted">
            {formatMoney(b.total)} · {upperFirst(b.payment_status || "unpaid")}
          </span>
        </div>
      </Link>
      {canManage ? (
        <BookingActionsMenu
          booking={b}
          filters={filters}
          markPaidAction={markPaid}
          checkPaymentAction={checkPayment}
          resendAction={resend}
          listing={listing ? { id: listing.id, status: listing.status, host_posted: listing.host_posted } : null}
          setPublicAction={setBookingPublic}
          rescheduleLinkAction={sendRescheduleLink}
          keepOnCalendarAction={keepOnCalendar}
          restoreAction={restore}
          archiveAction={archive}
        />
      ) : null}
    </li>
  );
}

function PhoneListingCard({ e, href }) {
  return (
    <li className="card p-3">
      <Link href={href} scroll={false} className="block">
        <p className="text-xs font-semibold text-ink-muted">
          {e.date ? formatDateShort(e.date) : "No date"}
          {eventTimeLabel(e) ? ` · ${eventTimeLabel(e)}` : ""}
          {e.space ? ` · ${spaceName(e.space).replace("The Alley ", "")}` : ""}
        </p>
        <p className="mt-0.5 font-semibold text-ink">{e.title || "(untitled)"}</p>
        <p className="truncate text-xs text-ink-soft">{e.host_name || "The Alley"}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <ListingTag status={e.status} />
          <span className="text-xs text-ink-muted">{e.status === "draft" ? "Waiting on the host" : "No booking"}</span>
        </div>
      </Link>
    </li>
  );
}

function ListingRow({ e, href, focused, tenant }) {
  return (
    <LinkRow href={href} id={`ev-${e.id}`} className={cx(focused && "bg-verde/50 hover:bg-verde/50")}>
      <Td>
        <div className="whitespace-nowrap font-medium text-ink">{e.date ? formatDateShort(e.date) : "No date"}</div>
        <div className="text-xs text-ink-muted">{eventTimeLabel(e) || ""}</div>
      </Td>
      <Td>
        <Link href={href} scroll={false} className="group block">
          <span className="font-medium text-ink group-hover:underline">{e.title || "(untitled)"}</span>
          <span className="block text-xs text-ink-soft">
            {tenant ? `Tenant · ${tenant}` : e.host_name || "The Alley"}
          </span>
        </Link>
      </Td>
      <Td className="whitespace-nowrap">{e.space ? spaceName(e.space).replace("The Alley ", "") : "—"}</Td>
      <Td>
        <span className="text-xs text-ink-muted">{e.status === "draft" ? "Waiting on host" : "Listing only"}</span>
      </Td>
      <Td><ListingTag status={e.status} /></Td>
      <Td className="text-xs text-ink-muted">{e.ticket_price != null ? `Tickets $${Number(e.ticket_price).toFixed(2)}` : "—"}</Td>
      <Td className="text-right text-ink-muted">—</Td>
      <Td className="text-right">
        <Link href={href} scroll={false} className="whitespace-nowrap rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-ink hover:bg-paper-dim">
          Open
        </Link>
      </Td>
    </LinkRow>
  );
}

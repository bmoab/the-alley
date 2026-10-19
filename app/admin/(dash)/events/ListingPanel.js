import Link from "next/link";
import { cache } from "react";
import { CalendarClock, FileText, Image as ImageIcon, KeyRound, Link2, Mail, Ticket, Type, X } from "lucide-react";
import { getEvent, parseEventLinks, getEventSessions } from "@/lib/catalog.js";
import { getBooking } from "@/lib/bookings.js";
import { canSellTickets, ticketsSold, ticketsLeft, salesTaxes } from "@/lib/tickets.js";
import { SPACES, spaceName, formatDate, formatTime, venueToday, upperFirst } from "@/lib/constants.js";
import { eventTimeLabel } from "@/lib/event-time.js";
import LinksEditor from "@/components/LinksEditor.js";
import EventMediaField from "@/components/admin/EventMediaField.js";
import Button from "@/components/admin/ui/Button.js";
import Badge from "@/components/admin/ui/Badge.js";
import CopyField from "@/components/admin/ui/CopyField.js";
import EditCard from "@/components/admin/ui/EditCard.js";
import ConfirmButton from "@/components/admin/ui/ConfirmButton.js";
import {
  approveEvent,
  setEventPublic,
  removeEvent,
  saveListingSection,
  emailHostLink,
  remindHost,
  openTickets,
  toggleTickets,
} from "./listing-actions.js";
import Select from "@/components/admin/ui/Select.js";

const APP_URL = process.env.APP_URL || "";

/** An event's stored pdf_paths JSON → array (tolerates null / bad JSON). */
function parsePdfPaths(ev) {
  try {
    const p = JSON.parse(ev.pdf_paths || "[]");
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

// One Square lookup per page render.
const taxesOnce = cache(async () => {
  try {
    return { taxes: await salesTaxes() };
  } catch (err) {
    return { taxes: [], error: err.message };
  }
});

const STATE = {
  live: { label: "On the public calendar", tone: "success", note: "Anyone can see it on the calendar and the Events page." },
  private: { label: "Private", tone: "neutral", note: "Hidden from the public calendar. Nothing the host wrote is lost." },
  pending: { label: "Waiting for your review", tone: "warning", note: "The host sent it in. Approve it to put it on the calendar." },
  draft: { label: "Waiting on the host", tone: "neutral", note: "Their link is sent. It shows up here once they fill it in." },
};

function Row({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <span className="shrink-0 text-ink-muted">{label}</span>
      <span className="min-w-0 truncate text-right font-medium text-ink">{children}</span>
    </div>
  );
}

const Empty = ({ children }) => <span className="font-normal text-ink-muted">{children}</span>;
const icon = (I) => <I className="h-4 w-4" aria-hidden="true" />;

function SectionTitle({ i, children }) {
  return (
    <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">
      {icon(i)}
      {children}
    </h3>
  );
}

/**
 * One listing's details in a side panel on the Events page (?ev=<id>): whether
 * guests can see it, tickets, every field, and the host's link — the same
 * panel whichever way you got here (the calendar, the list, a booking).
 * Full-screen on a phone, with a close button that keeps your place.
 */
export default async function ListingPanel({ id, closeHref }) {
  const ev = getEvent(Number(id));
  return (
    <>
      <Link href={closeHref} scroll={false} aria-label="Close" className="fixed inset-0 z-[55] bg-ink/35" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Listing details"
        className="admin-ui fixed right-0 top-0 z-[56] flex h-full w-full max-w-[560px] flex-col bg-paper-dim shadow-sheet"
      >
        <div className="relative overflow-hidden bg-ink px-5 pb-5 pt-5 text-paper">
          {ev?.photo_path ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ev.photo_path} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" />
          ) : null}
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-paper/60">Public listing</p>
              <h2 className="mt-0.5 text-xl font-semibold">{ev ? ev.title || ev.host_name || "(Untitled)" : "Not found"}</h2>
              {ev ? (
                <p className="mt-1 text-sm text-paper/75">
                  {ev.host_name ? `${ev.host_name} · ` : ""}
                  {ev.date ? formatDate(ev.date) : "No date yet"}
                  {eventTimeLabel(ev) ? ` · ${eventTimeLabel(ev)}` : ""}
                  {ev.space ? ` · ${spaceName(ev.space)}` : ""}
                </p>
              ) : null}
            </div>
            <Link
              href={closeHref}
              scroll={false}
              aria-label="Close"
              className="rounded-lg p-1 text-paper/70 transition hover:bg-paper/10 hover:text-paper"
            >
              <X className="h-5 w-5" />
            </Link>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {ev ? <ListingBody ev={ev} /> : <p className="text-sm text-ink-muted">That listing no longer exists.</p>}
        </div>
      </aside>
    </>
  );
}

async function ListingBody({ ev }) {
  const state = STATE[ev.status] || { label: upperFirst(ev.status || ""), tone: "neutral", note: "" };
  // A live listing whose host hasn't filled it in — a title-only placeholder.
  const placeholder = ev.status === "live" && ev.host_token && !ev.host_posted;
  const booking = ev.booking_id ? getBooking(ev.booking_id) : null;

  // Recurring shows: how many dates are left and when the next one is.
  const today = venueToday();
  const sessions = getEventSessions(ev);
  const upcoming = sessions.filter((s) => s.date >= today);

  return (
    <div className="space-y-4">
      {/* Who can see it, and the button that changes that, FIRST — on a phone,
          "is this on the calendar?" shouldn't mean scrolling past every field. */}
      <section className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={state.tone}>{state.label}</Badge>
          {placeholder ? <Badge tone="warning">Placeholder · host hasn’t posted</Badge> : null}
          {sessions.length ? (
            <Badge tone="sage">
              {upcoming.length
                ? `${upcoming.length} date${upcoming.length === 1 ? "" : "s"} left · next ${formatDate(upcoming[0].date)}`
                : `${sessions.length} dates · all past`}
            </Badge>
          ) : null}
        </div>
        {state.note ? <p className="mt-2 text-sm text-ink-soft">{state.note}</p> : null}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {ev.status === "pending" ? (
            <form action={approveEvent}>
              <input type="hidden" name="id" value={ev.id} />
              <Button type="submit" variant="accent" size="sm">Approve &amp; publish</Button>
            </form>
          ) : ev.status === "live" || ev.status === "private" ? (
            <form action={setEventPublic}>
              <input type="hidden" name="id" value={ev.id} />
              <input type="hidden" name="public" value={ev.status === "private" ? "1" : "0"} />
              <Button type="submit" variant={ev.status === "private" ? "accent" : "ghost"} size="sm">
                {ev.status === "private" ? "Make public" : "Make private"}
              </Button>
            </form>
          ) : null}
          {ev.status === "live" ? (
            <a href={`/events/${ev.id}`} target="_blank" rel="noreferrer" className="text-sm font-semibold text-verde-deep hover:underline">
              View it ↗
            </a>
          ) : null}
          {booking ? (
            <Link href={`/admin/events?b=${booking.id}`} scroll={false} className="text-sm font-semibold text-verde-deep hover:underline">
              Booking: {booking.client_name} · {upperFirst(booking.status)} →
            </Link>
          ) : null}
        </div>
      </section>

      {ev.host_token ? <HostLink ev={ev} placeholder={placeholder} /> : null}
      {ev.status !== "draft" ? <Sections ev={ev} /> : null}
      {ev.status !== "draft" ? <TicketPanel ev={ev} /> : null}

      <section className="rounded-2xl border border-rust/20 p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-rust">{ev.status === "draft" ? "Cancel" : "Remove"}</h3>
        <p className="mt-1 text-sm text-ink-soft">
          Takes it off the calendar for good{ev.host_token ? " and the host’s link stops working" : ""}.
          {booking ? " The booking itself stays." : ""}
        </p>
        <form action={removeEvent} className="mt-3">
          <input type="hidden" name="id" value={ev.id} />
          <ConfirmButton
            label={ev.status === "draft" ? "Cancel this special event" : "Remove this listing"}
            variant="danger"
            confirmLabel="Yes, remove it"
            pendingLabel="Removing…"
            question={`Remove “${ev.title || ev.host_name || "this listing"}”? This can’t be undone.`}
          />
        </form>
      </section>
    </div>
  );
}

function HostLink({ ev, placeholder }) {
  return (
    <section className="card p-4">
      <SectionTitle i={KeyRound}>The host’s link</SectionTitle>
      <p className="mt-2 text-sm text-ink-soft">
        {ev.status === "draft"
          ? "Sent — they haven’t filled it in yet. "
          : ""}
        Their private page for the title, description, photo and how guests pay. Open it to edit for them, or send it again.
      </p>
      <CopyField url={`${APP_URL}/host-listing/${ev.host_token}`} className="mt-3" />
      <div className="mt-3 flex flex-wrap gap-2">
        <form action={emailHostLink}>
          <input type="hidden" name="id" value={ev.id} />
          <Button type="submit" variant="subtle" size="sm" icon={Mail} disabled={!ev.host_email}>
            {ev.host_email ? `Email it to ${ev.host_email}` : "No host email on file"}
          </Button>
        </form>
        {placeholder && ev.host_email ? (
          <form action={remindHost}>
            <input type="hidden" name="id" value={ev.id} />
            <Button type="submit" variant="ghost" size="sm">Remind them to finish</Button>
          </form>
        ) : null}
      </div>
    </section>
  );
}

/**
 * Selling tickets to The Alley's own event. The ticket is a Square item with
 * sales tax on it, so tax is collected online and at the door alike.
 */
async function TicketPanel({ ev }) {
  if (!canSellTickets(ev)) return null;
  const { taxes, error } = await taxesOnce();
  const taxLabel = taxes.map((t) => `${t.name} ${t.percentage}%`).join(" + ");
  const selling = !!ev.square_ticket_variation_id;
  const left = selling ? await ticketsLeft(ev).catch(() => null) : null;
  const sold = selling ? ticketsSold(ev) : 0;
  return (
    <section className="card p-4">
      <div className="flex items-center justify-between gap-3">
        <SectionTitle i={Ticket}>Tickets sold by The Alley</SectionTitle>
        {selling ? (
          <Badge tone={ev.ticket_sales_open ? "success" : "neutral"}>{ev.ticket_sales_open ? "On sale" : "Online sales stopped"}</Badge>
        ) : null}
      </div>
      {selling ? (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            [`$${Number(ev.ticket_price).toFixed(2)}`, `+ ${taxLabel || "sales tax"}`],
            [String(sold), "Sold (as of last night)"],
            [left != null ? String(left) : ev.ticket_capacity == null ? "No limit" : "—", "Left"],
          ].map(([big, small]) => (
            <div key={small} className="rounded-xl bg-paper-warm px-3 py-2.5">
              <p className="text-lg font-semibold tabular-nums text-ink">{big}</p>
              <p className="text-[11px] leading-tight text-ink-muted">{small}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-ink-soft">
          Sell admission here and it&apos;s rung up through Square with sales tax added — online from this listing, and at
          the door from the register (under &ldquo;Event tickets&rdquo;). Admission The Alley sells is taxable in Utah.
        </p>
      )}
      {error ? <p className="mt-2 text-xs text-rust">Couldn&apos;t check Square&apos;s sales tax: {error}</p> : null}
      {!error && !taxes.length ? (
        <p className="mt-2 text-xs text-rust">Square has no sales tax switched on. Add it in Square Dashboard → Settings → Sales taxes first.</p>
      ) : null}
      <form action={openTickets} className="mt-4 flex flex-wrap items-end gap-2">
        <input type="hidden" name="id" value={ev.id} />
        <div>
          <label className="label" htmlFor="tk-price">Price (before tax)</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-muted">$</span>
            <input id="tk-price" name="ticket_price" inputMode="decimal" required defaultValue={ev.ticket_price ?? ""} className="field w-32 pl-7" placeholder="15.00" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="tk-cap">Spots</label>
          <input id="tk-cap" name="ticket_capacity" inputMode="numeric" defaultValue={ev.ticket_capacity ?? ""} className="field w-32" placeholder="No limit" />
        </div>
        <Button type="submit" variant={selling ? "ghost" : "accent"} size="sm" disabled={!taxes.length}>
          {selling ? "Update" : "Put tickets on sale"}
        </Button>
      </form>
      {selling ? (
        <form action={toggleTickets} className="mt-2">
          <input type="hidden" name="id" value={ev.id} />
          <input type="hidden" name="open" value={ev.ticket_sales_open ? "0" : "1"} />
          <Button type="submit" variant="subtle" size="sm">
            {ev.ticket_sales_open ? "Stop selling online" : "Reopen online sales"}
          </Button>
        </form>
      ) : null}
    </section>
  );
}

/** Every field, one section at a time: a summary until you press Edit. */
function Sections({ ev }) {
  const links = parseEventLinks(ev);
  const pdfs = parsePdfPaths(ev);
  const h = (section) => ({ id: ev.id, section });
  const guests = eventTimeLabel(ev);
  return (
    <>
      <EditCard
        title="Details"
        icon={icon(Type)}
        action={saveListingSection}
        hidden={h("details")}
        view={
          <>
            <Row label="Title">{ev.title || <Empty>None yet</Empty>}</Row>
            <Row label="Host">{ev.host_name || <Empty>None</Empty>}</Row>
            {ev.description ? (
              <p className="mt-2 line-clamp-4 whitespace-pre-line text-sm leading-relaxed text-ink-soft">{ev.description}</p>
            ) : (
              <p className="mt-2 text-sm text-ink-muted">No description yet.</p>
            )}
          </>
        }
      >
        <div>
          <label className="label" htmlFor="ev-title">Title</label>
          <input id="ev-title" name="title" required defaultValue={ev.title || ""} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="ev-host">Host name</label>
          <input id="ev-host" name="host_name" defaultValue={ev.host_name || ""} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="ev-desc">Description</label>
          <textarea id="ev-desc" name="description" rows={5} defaultValue={ev.description || ""} className="field" />
        </div>
      </EditCard>

      <EditCard
        title="When"
        icon={icon(CalendarClock)}
        action={saveListingSection}
        hidden={h("when")}
        view={
          <>
            <Row label="Date">{ev.date ? formatDate(ev.date) : <Empty>No date yet</Empty>}</Row>
            <Row label="Booked from">{ev.time ? formatTime(ev.time) : <Empty>No time</Empty>}</Row>
            <Row label="Guests see">{guests || <Empty>The booking time</Empty>}</Row>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="ev-date">Date</label>
            <input id="ev-date" type="date" name="date" required defaultValue={ev.date || ""} className="field" />
          </div>
          <div>
            <label className="label" htmlFor="ev-time">Booking time</label>
            <input id="ev-time" type="time" name="time" defaultValue={ev.time || ""} className="field" />
          </div>
          <div>
            <label className="label" htmlFor="ev-pt">Guests arrive at</label>
            <input id="ev-pt" type="time" name="public_time" defaultValue={ev.public_time || ""} className="field" />
          </div>
          <div>
            <label className="label" htmlFor="ev-pe">Ends at</label>
            <input id="ev-pe" type="time" name="public_end_time" defaultValue={ev.public_end_time || ""} className="field" />
          </div>
        </div>
        <p className="text-xs text-ink-muted">
          Hosts often book early to set up, so the calendar shows the arrive and end times. Leave them blank to use the
          booking time. Changing them never moves the reservation.
        </p>
      </EditCard>

      <EditCard
        title="Spots & payment"
        icon={icon(Ticket)}
        action={saveListingSection}
        hidden={h("pay")}
        view={
          <>
            <Row label="Spots">{ev.tickets ?? <Empty>No limit</Empty>}</Row>
            <Row label="Price">{ev.price || <Empty>Not listed</Empty>}</Row>
            <Row label="How to pay">{ev.payment_instructions || <Empty>None</Empty>}</Row>
            {ev.payment_link ? (
              <div className="mt-2">
                <p className="mb-1 text-xs text-ink-muted">Payment link</p>
                <CopyField url={ev.payment_link} />
              </div>
            ) : null}
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="ev-spots">Spots</label>
            <input id="ev-spots" name="tickets" inputMode="numeric" defaultValue={ev.tickets ?? ""} className="field" />
          </div>
          <div>
            <label className="label" htmlFor="ev-price">Price</label>
            <input id="ev-price" name="price" defaultValue={ev.price || ""} placeholder="$20, Free…" className="field" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="ev-howpay">How to pay</label>
          <input id="ev-howpay" name="payment_instructions" defaultValue={ev.payment_instructions || ""} placeholder="Pay at the door, Venmo…" className="field" />
        </div>
        <div>
          <label className="label" htmlFor="ev-paylink">Payment link</label>
          <input id="ev-paylink" name="payment_link" defaultValue={ev.payment_link || ""} placeholder="https://…" className="field" />
        </div>
      </EditCard>

      <EditCard
        title="Links"
        icon={icon(Link2)}
        action={saveListingSection}
        hidden={h("links")}
        view={
          links.length ? (
            <div className="space-y-2">
              {links.map((l) => (
                <div key={l.url}>
                  {l.label ? <p className="mb-1 text-xs font-semibold text-ink-soft">{l.label}</p> : null}
                  <CopyField url={l.url} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-muted">No links. They show as buttons on the public listing.</p>
          )
        }
      >
        <LinksEditor name="links" value={links} />
        <p className="text-xs text-ink-muted">Each one is a button on the public listing.</p>
      </EditCard>

      <EditCard
        title="Photo & PDFs"
        icon={icon(ImageIcon)}
        action={saveListingSection}
        hidden={h("media")}
        view={
          ev.photo_path || pdfs.length ? (
            <div className="space-y-3">
              {ev.photo_path ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={ev.photo_path} alt="" className="h-40 w-full rounded-xl object-cover" />
              ) : null}
              {pdfs.length ? (
                <div className="flex flex-wrap gap-2">
                  {pdfs.map((p, i) => (
                    <a
                      key={p}
                      href={p}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full bg-paper-warm px-3 py-1 text-xs font-semibold text-ink-soft hover:text-ink"
                    >
                      <FileText className="h-3.5 w-3.5" aria-hidden="true" /> PDF {i + 1}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-ink-muted">No photo or PDFs yet.</p>
          )
        }
      >
        <EventMediaField photo={ev.photo_path || ""} pdfs={pdfs} />
      </EditCard>
    </>
  );
}

/** The "New Alley event" form at the top of the Events page. */
export function NewEventForm({ createEvent }) {
  return (
    <form action={createEvent} className="grid grid-cols-1 gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><label className="label">Title</label><input name="title" required className="field" /></div>
        <div><label className="label">Host name</label><input name="host_name" defaultValue="The Alley On Center" className="field" /></div>
      </div>
      <div><label className="label">Description</label><textarea name="description" rows={3} className="field" /></div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div><label className="label">Date</label><input type="date" name="date" required className="field" /></div>
        <div><label className="label">Time</label><input type="time" name="time" className="field" /></div>
        <div>
          <label className="label">Space</label>
          <Select name="space">
            <option value="">—</option>
            {SPACES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>
        <div><label className="label">Spots</label><input type="number" name="tickets" className="field" /></div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><label className="label">Guests arrive at (optional)</label><input type="time" name="public_time" className="field" /></div>
        <div><label className="label">Ends at (optional)</label><input type="time" name="public_end_time" className="field" /></div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div><label className="label">Price</label><input name="price" className="field" /></div>
        <div><label className="label">Payment instructions</label><input name="payment_instructions" className="field" /></div>
        <div><label className="label">Payment link</label><input name="payment_link" className="field" /></div>
      </div>
      <div>
        <label className="label">Links (buttons on the public listing)</label>
        <LinksEditor name="links" value={[]} />
      </div>
      <div className="rounded-xl border border-line bg-paper-warm/40 p-4">
        <EventMediaField />
      </div>
      <Button type="submit" className="w-fit">Publish event</Button>
    </form>
  );
}

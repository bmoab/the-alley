import Link from "next/link";
import { cache } from "react";
import { X } from "lucide-react";
import { getEvent, parseEventLinks, getEventSessions } from "@/lib/catalog.js";
import { getBooking } from "@/lib/bookings.js";
import { canSellTickets, ticketsSold, ticketsLeft, salesTaxes } from "@/lib/tickets.js";
import { SPACES, spaceName, formatDate, venueToday, upperFirst } from "@/lib/constants.js";
import { eventTimeLabel } from "@/lib/event-time.js";
import LinksEditor from "@/components/LinksEditor.js";
import EventMediaField from "@/components/admin/EventMediaField.js";
import Button from "@/components/admin/ui/Button.js";
import { cx } from "@/components/admin/ui/cx.js";
import {
  approveEvent,
  setEventPublic,
  removeEvent,
  saveEvent,
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
  live: { label: "On the public calendar", tone: "bg-verde/60 text-ink-soft" },
  private: { label: "Private — not on the calendar", tone: "bg-rust/10 text-rust" },
  pending: { label: "Waiting for your review", tone: "bg-gold/20 text-ink" },
  draft: { label: "Waiting on the host", tone: "bg-ink/5 text-ink-soft" },
};

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
        className="admin-ui fixed right-0 top-0 z-[56] flex h-full w-full max-w-[560px] flex-col bg-paper shadow-sheet"
      >
        <div className="bg-ink px-5 pb-4 pt-5 text-paper">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-paper/60">Public listing</p>
              <h2 className="mt-0.5 text-lg font-semibold">{ev ? ev.title || ev.host_name || "(untitled)" : "Not found"}</h2>
              {ev ? (
                <p className="mt-0.5 text-sm text-paper/70">
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
        <div className="flex-1 overflow-y-auto p-5">
          {ev ? <ListingBody ev={ev} /> : <p className="text-sm text-ink-muted">That listing no longer exists.</p>}
        </div>
      </aside>
    </>
  );
}

async function ListingBody({ ev }) {
  const state = STATE[ev.status] || { label: ev.status, tone: "bg-ink/5 text-ink-soft" };
  // A live listing whose host hasn't filled it in — a title-only placeholder.
  const placeholder = ev.status === "live" && ev.host_token && !ev.host_posted;
  const booking = ev.booking_id ? getBooking(ev.booking_id) : null;

  // Recurring shows: how many dates are left and when the next one is.
  const today = venueToday();
  const sessions = getEventSessions(ev);
  const upcoming = sessions.filter((s) => s.date >= today);

  return (
    <div className="space-y-4">
      {/* Status and the buttons FIRST — on a phone, "is this on the calendar?"
          shouldn't mean scrolling past every field. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={cx("rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide", state.tone)}>
          {state.label}
        </span>
        {placeholder ? (
          <span className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-soft">
            Placeholder · host hasn’t posted
          </span>
        ) : null}
        {sessions.length ? (
          <span className="rounded-full border border-verde-deep/30 bg-verde/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-soft">
            {upcoming.length
              ? `${upcoming.length} date${upcoming.length === 1 ? "" : "s"} left · next ${formatDate(upcoming[0].date)}`
              : `${sessions.length} dates · all past`}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-3">
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
        {booking ? (
          <Link href={`/admin/events?b=${booking.id}`} scroll={false} className="text-sm font-semibold text-verde-deep hover:underline">
            Booking: {booking.client_name} · {upperFirst(booking.status)} →
          </Link>
        ) : null}
        <form action={removeEvent} className="ml-auto">
          <input type="hidden" name="id" value={ev.id} />
          <button className="text-sm font-semibold text-rust hover:underline">
            {ev.status === "draft" ? "Cancel it" : "Remove"}
          </button>
        </form>
      </div>

      {ev.host_token ? <HostLink ev={ev} placeholder={placeholder} /> : null}
      {ev.status !== "draft" ? <TicketPanel ev={ev} /> : null}
      {ev.status !== "draft" ? <EventEditor ev={ev} /> : null}
    </div>
  );
}

function HostLink({ ev, placeholder }) {
  return (
    <div className="rounded-xl border border-line bg-paper-warm p-4">
      <p className="text-sm font-semibold text-ink">
        {ev.status === "draft" ? "Special event — link sent, the host hasn’t filled it in yet" : "The host’s own link"}
      </p>
      <p className="mt-1 text-xs text-ink-muted">
        Their private page for the title, description, photo and how guests pay. Open it to edit for them, or send it again.
      </p>
      <input readOnly value={`${APP_URL}/host-listing/${ev.host_token}`} className="field mt-2 text-xs" />
      <div className="mt-2 flex flex-wrap gap-2">
        <form action={emailHostLink}>
          <input type="hidden" name="id" value={ev.id} />
          <Button type="submit" variant="ghost" size="sm" disabled={!ev.host_email}>
            {ev.host_email ? `Email it to ${ev.host_email}` : "No host email on file"}
          </Button>
        </form>
        {placeholder && ev.host_email ? (
          <form action={remindHost}>
            <input type="hidden" name="id" value={ev.id} />
            <Button type="submit" variant="subtle" size="sm">Remind them to finish</Button>
          </form>
        ) : null}
      </div>
    </div>
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
    <div className="rounded-xl border border-line bg-paper-dim p-4">
      <p className="text-sm font-semibold text-ink">Tickets sold by The Alley</p>
      {selling ? (
        <p className="mt-1 text-sm text-ink-soft">
          ${Number(ev.ticket_price).toFixed(2)} + {taxLabel || "sales tax"} ·{" "}
          {ev.ticket_sales_open ? "on sale online" : "online sales stopped"} · {sold} sold (as of last night&apos;s sync)
          {left != null ? ` · ${left} left` : ev.ticket_capacity == null ? " · no limit" : ""}
        </p>
      ) : (
        <p className="mt-1 text-xs text-ink-muted">
          Sell admission here and it&apos;s rung up through Square with sales tax added — online from this listing, and at
          the door from the register (look under &ldquo;Event tickets&rdquo;). Admission The Alley sells is taxable in Utah.
        </p>
      )}
      {error ? <p className="mt-2 text-xs text-rust">Couldn&apos;t check Square&apos;s sales tax: {error}</p> : null}
      {!error && !taxes.length ? (
        <p className="mt-2 text-xs text-rust">Square has no sales tax switched on. Add it in Square Dashboard → Settings → Sales taxes first.</p>
      ) : null}
      <form action={openTickets} className="mt-3 flex flex-wrap items-end gap-2">
        <input type="hidden" name="id" value={ev.id} />
        <div>
          <label className="label">Price per ticket (before tax)</label>
          <input name="ticket_price" inputMode="decimal" required defaultValue={ev.ticket_price ?? ""} className="field w-32" placeholder="15.00" />
        </div>
        <div>
          <label className="label">Spots (blank = no limit)</label>
          <input name="ticket_capacity" inputMode="numeric" defaultValue={ev.ticket_capacity ?? ""} className="field w-32" />
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
    </div>
  );
}

function EventEditor({ ev }) {
  return (
    <form action={saveEvent} className="grid grid-cols-1 gap-3 border-t border-line pt-4">
      <input type="hidden" name="id" value={ev.id} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><label className="label">Title</label><input name="title" defaultValue={ev.title || ""} className="field" /></div>
        <div><label className="label">Host name</label><input name="host_name" defaultValue={ev.host_name || ""} className="field" /></div>
      </div>
      <div><label className="label">Description</label><textarea name="description" rows={4} defaultValue={ev.description || ""} className="field" /></div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><label className="label">Date</label><input type="date" name="date" defaultValue={ev.date || ""} className="field" /></div>
        <div><label className="label">Booking time</label><input type="time" name="time" defaultValue={ev.time || ""} className="field" /></div>
        <div><label className="label">Guests arrive at</label><input type="time" name="public_time" defaultValue={ev.public_time || ""} className="field" /></div>
        <div><label className="label">Ends at</label><input type="time" name="public_end_time" defaultValue={ev.public_end_time || ""} className="field" /></div>
      </div>
      <p className="-mt-1 text-xs text-ink-muted">
        The arrive/end times are what the public calendar shows. Hosts often book early to set up — set these so guests see
        the real event time. Blank falls back to the booking time. Changing them never moves the reservation.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><label className="label">Spots</label><input type="number" name="tickets" defaultValue={ev.tickets ?? ""} className="field" /></div>
        <div><label className="label">Price</label><input name="price" defaultValue={ev.price || ""} className="field" /></div>
        <div><label className="label">Payment instructions</label><input name="payment_instructions" defaultValue={ev.payment_instructions || ""} className="field" /></div>
        <div><label className="label">Payment link</label><input name="payment_link" defaultValue={ev.payment_link || ""} className="field" /></div>
      </div>
      <div>
        <label className="label">Links (buttons on the public listing)</label>
        <LinksEditor name="links" value={parseEventLinks(ev)} />
      </div>
      <EventMediaField photo={ev.photo_path || ""} pdfs={parsePdfPaths(ev)} />
      <Button type="submit" className="w-fit">Save changes</Button>
    </form>
  );
}

/** The "New Alley event" form at the top of the Events page. */
export function NewEventForm({ createEvent }) {
  return (
    <form action={createEvent} className="mt-4 grid grid-cols-1 gap-3">
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
      <EventMediaField />
      <Button type="submit" className="w-fit">Publish event</Button>
    </form>
  );
}

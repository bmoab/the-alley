"use client";
import { useEffect, useState, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import {
  dotColor,
  denverDayLabel,
  denverTime,
  DELIVERY_COLOR,
} from "@/lib/activity-meta.js";
import { spaceName, formatDate, formatTime, formatMoney } from "@/lib/constants.js";

/**
 * Booking activity drawer. Slides in from the right (full-screen on mobile)
 * whenever the URL carries ?b=<bookingId> — set by clicking a booking in any
 * admin list. Two tabs: Activity (a day-grouped vertical timeline) and Details.
 *
 * A booked public event is one evening kept as two records — this booking, and
 * the listing guests see. The bar under the header carries the listing here, so
 * the room, the money, the history and "is this on the public calendar" are all
 * one tap from the calendar instead of two chips going two different places.
 * Styled to match the current admin (Inter + sage-verde + ink), following the
 * prototype's structure and dot color-coding.
 */
export default function BookingDrawer() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const bookingId = params.get("b");

  const [tab, setTab] = useState("activity");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [listingBusy, setListingBusy] = useState(false);
  const [listingError, setListingError] = useState(null);
  const [listingNote, setListingNote] = useState(null);

  const close = useCallback(() => {
    const next = new URLSearchParams(params.toString());
    next.delete("b");
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  // Fetch the booking + its activity whenever the open id changes. Also re-run
  // after creating a listing, which changes what this booking HAS.
  const load = useCallback(
    (signal) =>
      fetch(`/api/admin/activity?bookingId=${bookingId}`, { signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(r)))
        .then((json) => setData(json))
        .catch(() => {}),
    [bookingId]
  );

  useEffect(() => {
    if (!bookingId) return;
    setTab("activity");
    setData(null);
    setListingError(null);
    setListingNote(null);
    setLoading(true);
    const ctrl = new AbortController();
    load(ctrl.signal).finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [bookingId, load]);

  // Esc to close + lock body scroll while open.
  useEffect(() => {
    if (!bookingId) return;
    const onKey = (e) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [bookingId, close]);

  const open = Boolean(bookingId);
  const booking = data?.booking;
  const listing = data?.listing;
  const listingLive = listing?.status === "live";
  const groups = groupByDay(data?.activity || []);

  // Flip the listing without leaving the booking. Patches the drawer's own copy
  // so the bar updates immediately, then refreshes the page behind it (the
  // calendar chip changes colour, the events list regroups).
  const toggleListing = useCallback(async () => {
    if (listingBusy || !booking) return;
    setListingBusy(true);
    setListingError(null);
    try {
      const res = await fetch("/api/admin/listing-visibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // No listing yet? Go through the BOOKING, which creates one (and emails
        // the host their posting link) rather than failing on a missing id.
        body: JSON.stringify(
          listing
            ? { eventId: listing.id, public: listing.status !== "live" }
            : { bookingId: booking.id, public: true }
        ),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Couldn't change that just now.");
      if (listing) {
        setData((d) => (d ? { ...d, listing: { ...d.listing, status: json.status } } : d));
      } else {
        // A listing was just created (or wasn't, if they haven't paid) — re-read
        // rather than guessing, and show whatever the server decided happened.
        await load();
        if (json.message) setListingNote(json.message);
      }
      router.refresh();
    } catch (err) {
      setListingError(err.message);
    } finally {
      setListingBusy(false);
    }
  }, [booking, listing, listingBusy, load, router]);

  return (
    <>
      {/* Overlay */}
      <div
        onClick={close}
        className={`fixed inset-0 z-[55] bg-ink/35 transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden={!open}
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Booking activity"
        className={`admin-ui fixed right-0 top-0 z-[56] flex h-full w-full max-w-[440px] flex-col bg-paper shadow-sheet transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="bg-ink px-5 pb-4 pt-5 text-paper">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold">
                {booking
                  ? `${booking.client_name}${booking.event_type ? ` — ${booking.event_type}` : ""}`
                  : loading
                    ? "Loading…"
                    : "Booking"}
              </h2>
              {booking ? (
                <p className="mt-0.5 text-sm text-paper/70">
                  {spaceName(booking.space)} · {booking.status}
                </p>
              ) : null}
            </div>
            <button
              onClick={close}
              aria-label="Close"
              className="rounded-lg p-1 text-paper/70 transition hover:bg-paper/10 hover:text-paper"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Public listing. Shown even when there ISN'T one: a booking with no
            listing appears nowhere on the Public Events page, so without this
            there was no screen anywhere that offered to put it on the calendar. */}
        {booking ? (
          <div className="border-b border-line bg-paper-warm px-5 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                  Public listing
                </p>
                <p
                  className={`mt-0.5 truncate text-sm font-semibold ${
                    listingLive ? "text-verde-deep" : "text-rust"
                  }`}
                >
                  {listingLive ? "On the public calendar" : "Not on the public calendar"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={toggleListing}
                  disabled={listingBusy}
                  className="rounded-lg border border-line-strong px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-paper-dim disabled:opacity-50"
                >
                  {listingBusy
                    ? "…"
                    : listingLive
                      ? "Make private"
                      : listing
                        ? "Make public"
                        : "Add to public calendar"}
                </button>
                {listing ? (
                  <a
                    href={`/admin/events?ev=${listing.id}#ev-${listing.id}`}
                    className="rounded-lg px-2 py-1.5 text-xs font-semibold text-ink-muted transition hover:text-ink"
                  >
                    Edit
                  </a>
                ) : null}
              </div>
            </div>
            {listing?.title ? (
              <p className="mt-1 truncate text-xs text-ink-muted">{listing.title}</p>
            ) : !listing ? (
              <p className="mt-1 text-xs text-ink-muted">
                This booking has no listing yet, so it isn&apos;t on the Public Events page at all.
              </p>
            ) : null}
            {listingNote ? <p className="mt-1 text-xs text-ink-soft">{listingNote}</p> : null}
            {listingError ? <p className="mt-1 text-xs text-rust">{listingError}</p> : null}
          </div>
        ) : null}

        {/* Tabs */}
        <div className="flex border-b border-line bg-paper-warm">
          {["activity", "details"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wider transition ${
                tab === t
                  ? "border-b-2 border-verde-deep bg-paper text-ink"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <p className="text-sm text-ink-muted">Loading…</p>
          ) : !booking ? (
            <p className="text-sm text-ink-muted">Couldn&apos;t load this booking.</p>
          ) : tab === "activity" ? (
            groups.length === 0 ? (
              <p className="text-sm text-ink-muted">No activity recorded yet.</p>
            ) : (
              <div className="animate-fade-in">
                {groups.map((g) => (
                  <div key={g.day} className="mb-6 last:mb-0">
                    <div className="mb-3 border-b border-line pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                      {g.day}
                    </div>
                    {g.items.map((it, i) => (
                      <TimelineItem key={it.id} item={it} last={i === g.items.length - 1} />
                    ))}
                  </div>
                ))}
              </div>
            )
          ) : (
            <Details booking={booking} />
          )}
        </div>
      </aside>
    </>
  );
}

function TimelineItem({ item, last }) {
  const color = dotColor(item.event_type);
  const isSystem = !item.actor_name || item.actor_name === "system";
  const metaBits = [];
  if (item.recipient_email) metaBits.push(item.recipient_email);
  if (item.amount != null && !/\$/.test(item.description)) metaBits.push(formatMoney(item.amount));
  const tag = item.delivery_status ? DELIVERY_COLOR[item.delivery_status] || DELIVERY_COLOR.unknown : null;

  return (
    <div className="relative flex gap-3 pb-5">
      {!last ? (
        <span className="absolute left-[6px] top-4 -bottom-1 w-0.5 bg-line" aria-hidden="true" />
      ) : null}
      <span
        className="mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-paper"
        style={{ background: color }}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-ink-muted">{denverTime(item.created_at)}</div>
        <div className="text-sm font-medium text-ink">{item.description}</div>
        {metaBits.length || tag ? (
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-soft">
            {metaBits.length ? <span>{metaBits.join(" · ")}</span> : null}
            {tag ? (
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                style={{ background: tag.bg, color: tag.fg }}
              >
                {item.delivery_status}
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="mt-0.5 text-xs text-ink-muted">
          {isSystem ? "system" : `by ${item.actor_name}`}
        </div>
      </div>
    </div>
  );
}

function Details({ booking }) {
  const rows = [
    ["Client", booking.client_name],
    ["Email", booking.client_email],
    ["Phone", booking.client_phone],
    ["Space", spaceName(booking.space)],
    ["Date", formatDate(booking.date)],
    ["Time", `${formatTime(booking.start_time)} · ${booking.hours} hrs`],
    booking.event_type ? ["Event type", booking.event_type] : null,
    booking.guests ? ["Guests", booking.guests] : null,
    ["Alcohol", booking.alcohol ? "Yes" : "No"],
    booking.is_recurring ? ["Recurring", booking.recurring_schedule || "Yes"] : null,
    booking.series_id ? ["Series session", `${booking.series_index} of ${booking.series_total}`] : null,
    booking.series_id && booking.is_deposit_holder
      ? ["Series deposit", `${formatMoney(booking.deposit)} · ${booking.deposit_payment_status || "unpaid"}`]
      : null,
    ["Status", booking.status],
    ["Payment", booking.payment_status || "unpaid"],
    ["Deposit", formatMoney(booking.deposit)],
    ["Total", formatMoney(booking.total)],
  ].filter(Boolean);

  return (
    <dl className="animate-fade-in">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 border-b border-line py-2.5 text-sm last:border-0">
          <dt className="text-ink-muted">{k}</dt>
          <dd className="text-right font-medium text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function groupByDay(activity) {
  const groups = [];
  let current = null;
  for (const it of activity) {
    const day = denverDayLabel(it.created_at);
    if (!current || current.day !== day) {
      current = { day, items: [] };
      groups.push(current);
    }
    current.items.push(it);
  }
  return groups;
}

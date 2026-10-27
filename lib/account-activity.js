import { db } from "./db.js";
import { normalizeEmail } from "./portal.js";
import { listInbox } from "./accounts.js";
import { getIntake, listSales, consignorShare } from "./inventory.js";
import { vendorHistory } from "./vendor-record.js";
import { formatPayout } from "./payout.js";
import { paymentDetails } from "./payment-details.js";
import { monthLabel } from "./staff-costs.js";
import { spaceName, formatDateShort, formatTime, formatMoney, venueNow, venueToday } from "./constants.js";
import { sortActivity } from "./activity-feed.js";

/**
 * Everything that's happened on an account (server-only), newest first, as
 * rows for components/account/ActivityFeed.js (shape: lib/activity-feed.js).
 * Gathered from what already carries their (proven) email — bookings,
 * event listings, a tenant's business, a maker's shop, every email we've sent
 * them — and worded for them, not for us: nothing from the team's own notes.
 */

/** A stored UTC stamp ("YYYY-MM-DD HH:MM:SS" or ISO) as venue-local "YYYY-MM-DD HH:MM". */
function local(stamp) {
  if (!stamp) return "";
  const s = String(stamp);
  return venueNow(new Date(/[zZ]$|[+-]\d\d:?\d\d$/.test(s) ? s : `${s.replace(" ", "T")}Z`));
}

const money = (n) => formatMoney(n);

function endTime(start, hours) {
  if (!start) return "";
  const [h, m] = start.split(":").map(Number);
  const mins = h * 60 + m + Math.round((Number(hours) || 0) * 60);
  return `${String(Math.floor(mins / 60) % 24).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

/** "Sat, Nov 14" — the year only when it isn't this one. */
function day(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  const opts = { weekday: "short", month: "short", day: "numeric", ...(String(y) !== venueToday().slice(0, 4) ? { year: "numeric" } : {}) };
  return new Date(y, m - 1, d).toLocaleDateString("en-US", opts);
}
const when = (b) => `${day(b.date)} · ${formatTime(b.start_time)}–${formatTime(endTime(b.start_time, b.hours))}`;
const roomOf = (b) => spaceName(b.space);
/** "the Loft", but "The Alley Loft" as it is. */
const theRoom = (b) => (/^the\s/i.test(roomOf(b)) ? roomOf(b) : `the ${roomOf(b)}`);
/** Still waiting on payment, so a Pay link makes sense. */
const payable = (b) => b.payment_status === "unpaid" && ["pending", "held", "reserved"].includes(b.status) && b.payment_link;
const meta = (r) => {
  try {
    return r.metadata ? JSON.parse(r.metadata) : {};
  } catch {
    return {};
  }
};

/** Receipt lines for a paid invoice: how it was paid, and links to the receipt and invoice. */
function receipt(p, fallbackLink) {
  const details = [];
  const links = [];
  if (p?.method) details.push(["Paid with", p.method]);
  else if (p) details.push(["Paid with", "Recorded by The Alley (not a card payment through Square)"]);
  if (p?.receipt_number) details.push(["Receipt", `#${p.receipt_number}`]);
  if (p?.invoice_number) details.push(["Invoice", `#${p.invoice_number}`]);
  if (p?.receipt_url) links.push({ label: "Receipt", href: p.receipt_url });
  const inv = p?.invoice_url || fallbackLink;
  if (inv) links.push({ label: "Invoice", href: inv });
  return { details, links };
}

// ---------------------------------------------------------------------------

function accountRows(account) {
  const rows = [{ key: "acct-made", at: local(account.created_at), type: "account", title: "Made your Alley account", sub: account.email }];
  if (account.email_verified_at && local(account.email_verified_at) !== local(account.created_at)) {
    rows.push({ key: "acct-proved", at: local(account.email_verified_at), type: "account", title: "Confirmed your email address", sub: account.email });
  }
  return rows;
}

function emailRows(email) {
  return listInbox(email, { limit: 1000 }).map((m) => ({
    key: `mail-${m.id}`,
    at: local(m.sent_at),
    type: "email",
    title: m.subject,
    sub: m.mode === "inbox" ? "Posted to your account" : "Emailed to you",
    details: m.attachments ? [["Came with", JSON.parse(m.attachments).join(", ")]] : undefined,
    emailId: m.id,
  }));
}

// What the team's log says about a booking, in the customer's words. Anything
// not listed here (internal notes, holds kept, archiving…) isn't theirs to see.
const BOOKING_EVENTS = [
  "approved",
  "denied",
  "invoice_reissued",
  "payment_received",
  "comped",
  "rescheduled",
  "cancelled",
  "hold_expired",
  "deposit_refunded",
  "deposit_withheld",
];

function bookingRows(email, portalToken) {
  const bookings = db
    .prepare("SELECT * FROM bookings WHERE lower(trim(client_email)) = ? AND archived = 0 ORDER BY date, start_time")
    .all(email);
  if (!bookings.length) return { rows: [], invoices: [] };
  const byId = Object.fromEntries(bookings.map((b) => [b.id, b]));
  const portal = portalToken ? [{ label: "Your bookings", href: `/my-bookings/${portalToken}` }] : [];
  const rows = [];
  const today = venueNow();

  for (const b of bookings) {
    const inSeries = !!b.series_id;
    // A series is asked for once: on its first session.
    if (!inSeries || b.is_deposit_holder || b.series_index === 1) {
      const details = [];
      if (b.event_title) details.push(["Event", b.event_title]);
      if (b.event_type) details.push(["Kind of event", b.event_type]);
      if (b.guests) details.push(["Guests", b.guests]);
      if (inSeries && b.series_total) details.push(["Sessions", String(b.series_total)]);
      details.push(["Room", `${money(b.rate)} an hour × ${b.hours} hours`]);
      if (Number(b.deposit)) details.push(["Refundable deposit", money(b.deposit)]);
      rows.push({
        key: `bk-req-${b.id}`,
        at: local(b.created_at),
        type: "booking",
        title: inSeries ? `Asked for ${theRoom(b)}, ${b.series_total || "several"} sessions` : `Asked for ${theRoom(b)}`,
        sub: inSeries ? `Starting ${when(b)}` : when(b),
        details,
        links: portal,
      });
    }
    // The day itself, once it's been.
    if (["confirmed", "completed"].includes(b.status) && `${b.date} ${b.start_time}` <= today) {
      rows.push({
        key: `bk-day-${b.id}`,
        at: `${b.date} ${b.start_time}`,
        type: "booking",
        title: `Your time in ${theRoom(b)}`,
        sub: [`${formatTime(b.start_time)}–${formatTime(endTime(b.start_time, b.hours))}`, b.session_title || b.event_title].filter(Boolean).join(" · "),
      });
    }
  }

  const ids = bookings.map((b) => b.id);
  const log = db
    .prepare(
      `SELECT * FROM activity_log WHERE booking_id IN (${ids.map(() => "?").join(",")})
          AND delivery_status IS NULL AND event_type IN (${BOOKING_EVENTS.map(() => "?").join(",")})
        ORDER BY id`
    )
    .all(...ids, ...BOOKING_EVENTS);
  const invoices = bookings.flatMap((b) => [b.square_invoice_id, b.deposit_invoice_id]).filter(Boolean);
  const paid = paymentDetails(invoices);

  for (const e of log) {
    const b = byId[e.booking_id];
    const m = meta(e);
    const base = { key: `bk-log-${e.id}`, at: local(e.created_at), type: "booking", sub: `${roomOf(b)} · ${when(b)}` };
    const amount = e.amount != null ? Number(e.amount) : null;
    switch (e.event_type) {
      case "approved": {
        const free = /free of charge/i.test(e.description);
        const series = /series/i.test(e.description);
        rows.push({
          ...base,
          title: free ? "Approved — no charge" : series ? "Approved — your sessions are held" : "Approved — your date is held",
          details: free ? undefined : [["To pay", money(amount)]],
          links: !free && payable(b) ? [{ label: "Pay the invoice", href: b.payment_link }, ...portal] : portal,
        });
        break;
      }
      case "denied":
        rows.push({ ...base, title: "We couldn't take this booking", links: portal });
        break;
      case "invoice_reissued":
        rows.push({
          ...base,
          also: ["payment"],
          title: amount === 0 ? "Price changed — no charge" : `New invoice: ${money(amount)}`,
          links: payable(b) ? [{ label: "Pay the invoice", href: b.payment_link }] : undefined,
        });
        break;
      case "payment_received": {
        const r = receipt(paid[b.square_invoice_id], b.payment_link);
        const rental = Math.round((Number(b.rate) || 0) * (Number(b.hours) || 0) * Math.max(1, Number(b.sessions) || 1) * 100) / 100;
        const parts = [];
        if (rental && Number(b.deposit) && !b.series_id) {
          parts.push(["Room", money(rental)], ["Refundable deposit", money(b.deposit)]);
        }
        rows.push({
          ...base,
          type: "payment",
          also: ["booking"],
          title: `Paid for ${theRoom(b)}`,
          amount,
          flow: "out",
          details: [...parts, ...r.details],
          links: [...r.links, ...portal],
        });
        break;
      }
      case "comped":
        rows.push({ ...base, title: "Booked — no charge" });
        break;
      case "rescheduled":
        rows.push({
          ...base,
          title: "Date changed",
          sub: m.to_date ? `${roomOf(b)} · now ${day(m.to_date)}${m.to_start_time ? ` · ${formatTime(m.to_start_time)}` : ""}` : base.sub,
          details: m.from_date ? [["Was", `${formatDateShort(m.from_date)}${m.from_start_time ? ` · ${formatTime(m.from_start_time)}` : ""}`]] : undefined,
        });
        break;
      case "cancelled": {
        const p = paid[b.square_invoice_id];
        rows.push({
          ...base,
          also: amount ? ["payment"] : undefined,
          title: amount ? `Cancelled — ${money(amount)} refunded` : "Booking cancelled",
          amount: amount || null,
          flow: amount ? "in" : undefined,
          details: amount && p?.method ? [["Refunded to", p.method]] : undefined,
        });
        break;
      }
      case "hold_expired":
        rows.push({ ...base, title: "Hold ended — the invoice wasn't paid in time" });
        break;
      case "deposit_refunded":
      case "deposit_withheld": {
        const refunded = Number(m.refunded ?? (e.event_type === "deposit_refunded" ? amount : 0)) || 0;
        const kept = Number(m.withheld ?? (e.event_type === "deposit_withheld" ? amount : 0)) || 0;
        const p = paid[b.series_id ? b.deposit_invoice_id : b.square_invoice_id];
        const details = [];
        if (refunded) details.push(["Returned", money(refunded)]);
        if (refunded && p?.method) details.push(["Back to", p.method]);
        if (kept) details.push(["Kept", money(kept)]);
        if (kept && m.reason) details.push(["Why", m.reason]);
        rows.push({
          ...base,
          type: "payment",
          also: ["booking"],
          title: refunded ? (kept ? `Deposit: ${money(refunded)} returned` : "Deposit returned") : "Deposit kept",
          amount: refunded || kept,
          flow: refunded ? "in" : undefined,
          details,
        });
        break;
      }
    }
  }

  // A series' deposit is its own invoice.
  for (const b of bookings) {
    if (b.deposit_invoice_id && ["paid", "refunded"].includes(b.deposit_payment_status)) {
      const p = paid[b.deposit_invoice_id];
      if (!p) continue;
      const r = receipt(p, b.deposit_payment_link);
      rows.push({
        key: `bk-dep-${b.id}`,
        at: p.paid_at ? local(p.paid_at) : local(b.created_at),
        type: "payment",
        also: ["booking"],
        title: "Paid the refundable deposit",
        sub: `${roomOf(b)} · starting ${day(b.date)}`,
        amount: p.amount ?? b.deposit,
        flow: "out",
        details: r.details,
        links: [...r.links, ...portal],
      });
    }
  }
  return { rows, invoices };
}

function listingRows(email) {
  const listings = db
    .prepare(
      `SELECT id, title, date, status, host_token, booking_id, created_at FROM events
        WHERE lower(trim(host_email)) = ? AND host_token IS NOT NULL AND status != 'removed'`
    )
    .all(email);
  if (!listings.length) return [];
  const byId = Object.fromEntries(listings.map((e) => [e.id, e]));
  const byBooking = Object.fromEntries(listings.filter((e) => e.booking_id).map((e) => [e.booking_id, e]));
  const log = db
    .prepare("SELECT * FROM activity_log WHERE event_type IN ('host_listing_submitted', 'listing_visibility_changed') ORDER BY id")
    .all()
    .map((r) => ({ r, e: byId[meta(r).event_id] || (r.event_type === "host_listing_submitted" ? byBooking[r.booking_id] : null) }))
    .filter((x) => x.e);
  const rows = [];
  const seen = new Set();
  for (const { r, e } of log) {
    seen.add(e.id);
    const name = e.title ? `“${e.title}”` : "Your event";
    const link = [{ label: "Its page", href: `/host-listing/${e.host_token}` }];
    const sub = e.date ? formatDateShort(e.date) : undefined;
    if (r.event_type === "host_listing_submitted") {
      rows.push({ key: `ls-${r.id}`, at: local(r.created_at), type: "listing", title: `Sent ${name} in for our calendar`, sub, links: link });
    } else {
      const live = meta(r).to === "live";
      rows.push({
        key: `ls-${r.id}`,
        at: local(r.created_at),
        type: "listing",
        title: live ? `${name} is on our public calendar` : `${name} is off our public calendar`,
        sub,
        links: link,
      });
    }
  }
  for (const e of listings) {
    if (seen.has(e.id)) continue;
    rows.push({
      key: `ls-new-${e.id}`,
      at: local(e.created_at),
      type: "listing",
      title: `Event listing started${e.title ? `: “${e.title}”` : ""}`,
      sub: e.date ? formatDateShort(e.date) : undefined,
      links: [{ label: "Its page", href: `/host-listing/${e.host_token}` }],
    });
  }
  return rows;
}

function billRows(email, businesses) {
  const rows = [];
  const invoices = [];
  const ids = businesses.map((b) => b.id);
  const many = businesses.length > 1;
  const nameOf = Object.fromEntries(businesses.map((b) => [b.id, b.business_name]));
  if (ids.length) {
    const shares = db
      .prepare(
        `SELECT s.*, m.month FROM staff_cost_shares s JOIN staff_cost_months m ON m.id = s.month_id
          WHERE s.directory_id IN (${ids.map(() => "?").join(",")}) AND s.status IN ('sent', 'paid')`
      )
      .all(...ids);
    invoices.push(...shares.map((s) => s.square_invoice_id));
    const paid = paymentDetails(shares.map((s) => s.square_invoice_id));
    for (const s of shares) {
      const label = `Shared staff cost — ${monthLabel(s.month)}`;
      const sub = many ? nameOf[s.directory_id] : undefined;
      if (s.sent_at) {
        rows.push({
          key: `sc-bill-${s.id}`,
          at: local(s.sent_at),
          type: "payment",
          title: `Bill: ${label}`,
          sub,
          amount: s.amount,
          details: [["Status", s.status === "paid" ? "Paid" : "Not paid yet"]],
          links: s.status === "sent" && s.payment_link ? [{ label: "Pay it", href: s.payment_link }] : undefined,
        });
      }
      if (s.status === "paid" && s.paid_at) {
        const r = receipt(paid[s.square_invoice_id], s.payment_link);
        rows.push({ key: `sc-paid-${s.id}`, at: local(s.paid_at), type: "payment", title: `Paid: ${label}`, sub, amount: s.amount, flow: "out", details: r.details, links: r.links });
      }
    }
    const rent = db.prepare(`SELECT * FROM rent_payments WHERE directory_id IN (${ids.map(() => "?").join(",")})`).all(...ids);
    for (const p of rent) {
      rows.push({
        key: `rent-${p.id}`,
        at: p.received_on,
        type: "payment",
        title: `Rent for ${monthLabel(p.month)} received`,
        sub: many ? nameOf[p.directory_id] : undefined,
        amount: p.amount,
        flow: "out",
        details: p.note ? [["Note", p.note]] : undefined,
      });
    }
  }
  // A co-payer's share of the building's bills (by email).
  const shareBills = db.prepare("SELECT * FROM share_bills WHERE lower(trim(email)) = ? AND status IN ('sent', 'paid')").all(email);
  invoices.push(...shareBills.map((b) => b.square_invoice_id));
  const paidBills = paymentDetails(shareBills.map((b) => b.square_invoice_id));
  for (const b of shareBills) {
    const label = `Your share of ${monthLabel(b.month)}'s utilities`;
    if (b.sent_at) {
      rows.push({
        key: `sb-bill-${b.id}`,
        at: local(b.sent_at),
        type: "payment",
        title: `Bill: ${label}`,
        amount: b.amount,
        details: [...(b.detail ? [["What's in it", b.detail]] : []), ["Status", b.status === "paid" ? "Paid" : "Not paid yet"]],
        links: b.status === "sent" && b.payment_link ? [{ label: "Pay it", href: b.payment_link }] : undefined,
      });
    }
    if (b.status === "paid" && b.paid_at) {
      const r = receipt(paidBills[b.square_invoice_id], b.payment_link);
      rows.push({ key: `sb-paid-${b.id}`, at: local(b.paid_at), type: "payment", title: `Paid: ${label}`, amount: b.amount, flow: "out", details: r.details, links: r.links });
    }
  }
  return { rows, invoices };
}

// The maker record's kinds → Activity types. Reminders are left out: the
// email itself is already in their Activity.
const MAKER_KIND = {
  agreed: "terms",
  terms_updated: "terms",
  share_changed: "terms",
  payout_method: "terms",
  dropoff: "stock",
  declined: "stock",
  cancelled: "stock",
  received: "stock",
  returned: "stock",
  confirmed: "stock",
};

function makerRows(makers) {
  const rows = [];
  const many = makers.length > 1;
  for (const m of makers) {
    const page = `/account/consign/${m.id}`;
    const sub = many ? m.name : undefined;
    vendorHistory(m.id).forEach((h, i) => {
      if (h.kind === "paid" || h.kind === "reminder") return;
      const row = {
        key: `mk-${m.id}-${h.kind}-${i}`,
        at: local(h.at),
        type: MAKER_KIND[h.kind] || "terms",
        title: h.title,
        sub,
        details: h.detail ? [["", h.detail]] : undefined,
        links: [{ label: h.agreementId ? "Read what you agreed to" : "Your shop page", href: `${page}#record` }],
      };
      if (h.kind === "received" && h.intakeId) {
        const intake = getIntake(h.intakeId);
        row.lines = (intake?.lines || []).map((l) => ({ name: l.name, qty: l.qty, amount: l.price, each: true }));
        row.details = [["Counted in by", h.by || "The Alley"], ...(h.detail ? [["", h.detail]] : [])];
      }
      if (h.kind === "agreed") row.details = h.detail ? [["", h.detail]] : undefined;
      rows.push(row);
    });

    for (const p of db.prepare("SELECT * FROM consignor_payouts WHERE vendor_id = ?").all(m.id)) {
      const details = [
        ["For sales through", formatDateShort(p.through)],
        ["Sold", `${p.line_count} ${p.line_count === 1 ? "sale" : "sales"}, ${money(p.sales_total)} after discounts`],
      ];
      if (p.method) details.push(["Paid by", formatPayout(p.method)]);
      if (p.reference) details.push(["Reference", p.reference]);
      rows.push({
        key: `po-${p.id}`,
        at: local(p.created_at),
        type: "payout",
        title: "We paid you",
        sub,
        amount: p.amount,
        flow: "in",
        details,
        links: [{ label: "Your shop page", href: page }],
      });
    }

    // Each register sale of their work, one row per sale (a ticket at the till).
    const groups = new Map();
    for (const l of listSales({ vendorId: m.id, kind: "retail" })) {
      const k = `${l.square_order_id}-${l.is_return}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(l);
    }
    for (const [k, lines] of groups) {
      const back = !!lines[0].is_return;
      const qty = lines.reduce((t, l) => t + Math.abs(Number(l.qty) || 0), 0);
      const net = lines.reduce((t, l) => t + Number(l.net || 0), 0);
      const share = lines.reduce((t, l) => t + consignorShare(l), 0);
      const discount = lines.reduce((t, l) => t + Number(l.discount || 0), 0);
      const split = lines[0].split ?? lines[0].item_split ?? lines[0].vendor_split;
      const title = lines.length === 1 ? `${back ? "Returned" : "Sold"}: ${lines[0].name}${qty > 1 ? ` × ${qty}` : ""}` : `${back ? "Returned" : "Sold"} ${qty} items`;
      const details = [[back ? "Given back" : "Sold for", money(Math.abs(net))]];
      if (discount && !back) details.push(["Discount", money(discount)]);
      details.push([back ? "Comes off your share" : `Your share${split != null ? ` (${Number(split)}%)` : ""}`, money(Math.abs(share))]);
      details.push(["Paid out", lines.every((l) => l.payout_id) ? "Yes" : "Not yet"]);
      rows.push({
        key: `sale-${m.id}-${k}`,
        at: lines[0].sold_at,
        type: "sale",
        title,
        sub,
        amount: Math.abs(Math.round(share * 100) / 100),
        flow: back ? "out" : "in",
        details,
        lines: lines.length > 1 ? lines.map((l) => ({ name: l.name, qty: Math.abs(l.qty), amount: Math.abs(l.net) })) : undefined,
      });
    }
  }
  return rows;
}

/**
 * Everything on this account, newest first, plus the Square invoices behind
 * it (so the page can fill in any card and receipt details still missing).
 *   mine  whatsMine(email) — which makers, businesses and bookings are theirs
 */
export function accountActivity(account, mine) {
  const email = normalizeEmail(account.email);
  const bookings = bookingRows(email, mine.bookings.portalToken);
  const bills = billRows(email, mine.businesses);
  const rows = [
    ...accountRows(account),
    ...emailRows(email),
    ...bookings.rows,
    ...listingRows(email),
    ...bills.rows,
    ...makerRows(mine.makers),
  ].filter((r) => r.at && r.at.slice(0, 10) <= venueToday());
  return { rows: sortActivity(rows), invoices: [...bookings.invoices, ...bills.invoices].filter(Boolean) };
}

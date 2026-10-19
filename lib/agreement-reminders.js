import { db } from "./db.js";
import { venueToday, venueNow, shiftDate } from "./constants.js";

/**
 * Reminders that someone's consignment agreement is ending (server-only).
 *
 * ONE date per person. Makers (the shop's consignors) carry it as
 * vendors.agreement_ends. A gallery artist whose work is also consigned is the
 * same person: their exhibitor listing is linked to their maker record (or has
 * the same email), shares that one date, and gets ONE reminder. An artist with
 * no maker record uses their own "agreement ends" (exhibitors.active_until).
 *
 * A month out, then a week out, the dashboard asks someone to send a reminder.
 * Each stays there until it's sent or marked done, so one that comes due on a
 * Saturday is still waiting on Monday — and the team is emailed on business
 * days so nobody has to happen to look. The message is pre-written with real
 * dates (never "in 30 days"), so it reads right whichever day it goes out.
 * Nothing is sent to an artist automatically.
 */

export const REMINDERS = {
  month: { label: "1-month reminder", from: 30, to: 8 },
  week: { label: "1-week reminder", from: 7, to: 0 },
};

const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const md = (ymd, opts = { month: "short", day: "numeric" }) => new Date(`${ymd}T12:00:00`).toLocaleDateString("en-US", opts);

/** "Nov 1–5", or "Oct 30 – Nov 3" across a month. */
export function dayRange(from, to) {
  if (from === to) return md(from);
  return from.slice(0, 7) === to.slice(0, 7) ? `${md(from)}–${new Date(`${to}T12:00:00`).getDate()}` : `${md(from)} – ${md(to)}`;
}

/** Which reminder (if any) is due for an end date today: "month", "week" or null. */
/** "Krambule's", "Four Birds'". */
export const possessive = (name) => (/s$/i.test(String(name).trim()) ? `${name}’` : `${name}’s`);

export function reminderKindFor(endsOn, today = venueToday()) {
  if (!endsOn) return null;
  const left = daysBetween(today, endsOn);
  for (const [kind, w] of Object.entries(REMINDERS)) if (left <= w.from && left >= w.to) return kind;
  return null;
}

/** The maker an exhibitor listing belongs to: linked by hand, or the same email. */
export function makerForExhibitor(ex) {
  if (!ex) return null;
  if (ex.vendor_id) return db.prepare("SELECT * FROM vendors WHERE id = ?").get(ex.vendor_id) || null;
  const email = String(ex.contact_email || "").trim().toLowerCase();
  return email ? db.prepare("SELECT * FROM vendors WHERE lower(email) = ? AND is_active = 1").get(email) || null : null;
}

/**
 * A maker's end date: their own, or else the date on their gallery listing
 * (set before the two were linked).
 */
function makerEndsOn(v) {
  if (v.agreement_ends) return v.agreement_ends;
  const email = String(v.email || "").toLowerCase();
  return (
    db
      .prepare(
        `SELECT MAX(active_until) AS d FROM exhibitors
          WHERE active = 1 AND (vendor_id = ? OR (vendor_id IS NULL AND ? <> '' AND lower(contact_email) = ?))`
      )
      .get(v.id, email, email)?.d || null
  );
}

/** Who to greet: the maker's contact person, else their gallery listing's name, else the shop name. */
function makerPerson(v) {
  if (v.contact_name) return v.contact_name;
  const email = String(v.email || "").toLowerCase();
  const ex = db
    .prepare("SELECT name FROM exhibitors WHERE vendor_id = ? OR (vendor_id IS NULL AND ? <> '' AND lower(contact_email) = ?) LIMIT 1")
    .get(v.id, email, email);
  return ex?.name || v.name;
}

const makerParty = (v) => ({
  party: "maker",
  id: v.id,
  name: v.name,
  person: makerPerson(v),
  email: v.email,
  endsOn: makerEndsOn(v),
  href: `/admin/vendors/${v.id}`,
});

/**
 * Everyone with an agreement end date, one entry per person:
 * [{ party, id, name, email, endsOn, href }]. href is where their date is edited.
 */
export function agreementParties() {
  const out = [];
  for (const v of db.prepare("SELECT * FROM vendors WHERE is_active = 1").all()) {
    const p = makerParty(v);
    if (p.endsOn) out.push(p);
  }
  for (const ex of db.prepare("SELECT * FROM exhibitors WHERE active = 1 AND active_until IS NOT NULL").all()) {
    if (makerForExhibitor(ex)) continue; // the maker entry covers them
    out.push({ party: "artist", id: ex.id, name: ex.name, person: ex.name, email: ex.contact_email, endsOn: ex.active_until, href: `/admin/exhibitors/${ex.id}` });
  }
  return out;
}

export function getParty(party, id) {
  if (party === "maker") {
    const v = db.prepare("SELECT * FROM vendors WHERE id = ?").get(id);
    return v ? makerParty(v) : null;
  }
  if (party === "artist") {
    const ex = db.prepare("SELECT * FROM exhibitors WHERE id = ?").get(id);
    if (!ex) return null;
    const maker = makerForExhibitor(ex);
    if (maker) return getParty("maker", maker.id);
    return { party, id: ex.id, name: ex.name, person: ex.name, email: ex.contact_email, endsOn: ex.active_until, href: `/admin/exhibitors/${ex.id}` };
  }
  return null;
}

function handled(p, kind) {
  return db
    .prepare("SELECT * FROM agreement_reminders WHERE party = ? AND party_id = ? AND kind = ? AND ends_on = ?")
    .get(p.party, p.id, kind, p.endsOn);
}

/** Reminders waiting to be sent: [{ ...party, kind, label, daysLeft }], soonest first. */
export function remindersDue(today = venueToday()) {
  const out = [];
  for (const p of agreementParties()) {
    if (p.endsOn < today) continue;
    const kind = reminderKindFor(p.endsOn, today);
    if (!kind || handled(p, kind)) continue;
    out.push({ ...p, kind, label: REMINDERS[kind].label, daysLeft: daysBetween(today, p.endsOn) });
  }
  return out.sort((a, b) => a.endsOn.localeCompare(b.endsOn));
}

/** Every reminder sent or skipped for a person, newest first. */
export function reminderHistory(party, id) {
  return db.prepare("SELECT * FROM agreement_reminders WHERE party = ? AND party_id = ? ORDER BY sent_at DESC").all(party, id);
}

/**
 * The pre-written email: { subject, message }. Dates are spelled out, never
 * "in 30 days", so it's right whichever day it's sent.
 */
export function reminderDraft(p, kind, { senderName = "", today = venueToday() } = {}) {
  const first = String(p.person || p.name || "").trim().split(/\s+/)[0] || "there";
  const ends = p.endsOn;
  const pickupFrom = [shiftDate(ends, { days: -4 }), today].sort()[1];
  const pickup = dayRange(pickupFrom, ends);
  const endsLong = md(ends, { weekday: "long", month: "long", day: "numeric" });
  const sign = senderName ? `\n${senderName}` : "";
  if (kind === "week") {
    return {
      subject: `Picking up your work from The Alley by ${md(ends, { month: "long", day: "numeric" })}`,
      message: `Hi ${first},

Just a quick reminder that your consignment agreement with us ends on ${endsLong}.

If we haven't set a pickup day yet, please reply with a time ${pickup} that works for you. If we already have, we'll see you then!

Thank you so much for sharing your work with us,${sign}`,
    };
  }
  return {
    subject: `Your consignment agreement with The Alley ends ${md(ends, { month: "long", day: "numeric" })}`,
    message: `Hi ${first},

I hope you're doing well!

This is a friendly reminder that your consignment agreement with us ends on ${endsLong}.

We've truly appreciated having your artwork here, and so has everyone who walks through our doors.

Please let me know if you're available ${pickup} to pick up your work, or if there's another day that works better. If you'd like to talk about staying on longer, just reply to this email.

Thank you again,${sign}`,
  };
}

/** Record a reminder as sent, or as handled without an email (skipped). */
export function recordReminder({ party, partyId, kind, endsOn, skipped = false, subject = null, sentTo = null, by }) {
  db.prepare(
    `INSERT INTO agreement_reminders (party, party_id, kind, ends_on, skipped, subject, sent_to, sent_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (party, party_id, kind, ends_on) DO NOTHING`
  ).run(party, partyId, kind, endsOn, skipped ? 1 : 0, subject, sentTo, by);
}

/**
 * Email the team about reminders waiting to be sent — on business days only,
 * the first business day each one is waiting and again three days later if it
 * still hasn't gone. `send(items)` does the emailing. Returns what it did.
 */
export async function runAgreementAlerts({ send, force = false, now = new Date() } = {}) {
  const weekday = new Date(`${venueToday(now)}T12:00:00`).getDay();
  if (!force && (weekday === 0 || weekday === 6)) return { skipped: "weekend", count: 0 };
  const due = remindersDue(venueToday(now));
  const stamp = venueNow(now);
  const alert = (r) =>
    db.prepare("SELECT * FROM agreement_alerts WHERE party = ? AND party_id = ? AND kind = ? AND ends_on = ?").get(r.party, r.id, r.kind, r.endsOn);
  const toSend = due.filter((r) => {
    const a = alert(r);
    if (!a) return true;
    return a.times < 2 && daysBetween(a.last_at.slice(0, 10), stamp.slice(0, 10)) >= 3;
  });
  if (!toSend.length) return { skipped: "none", count: 0 };
  await send(due); // the email lists everything still waiting, not only the new ones
  const mark = db.prepare(
    `INSERT INTO agreement_alerts (party, party_id, kind, ends_on, times, last_at) VALUES (?, ?, ?, ?, 1, ?)
     ON CONFLICT (party, party_id, kind, ends_on) DO UPDATE SET times = times + 1, last_at = excluded.last_at`
  );
  db.transaction(() => {
    for (const r of toSend) mark.run(r.party, r.id, r.kind, r.endsOn, stamp);
  })();
  return { count: due.length, alerted: toSend.length };
}

/**
 * Set a person's agreement end date everywhere it lives: their maker record and
 * every exhibitor listing that's theirs, so the two can never disagree.
 * `date` is YYYY-MM-DD or "" to clear it.
 */
export function setAgreementEnds(party, id, date) {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) ? date : null;
  let maker = null;
  if (party === "maker") maker = db.prepare("SELECT * FROM vendors WHERE id = ?").get(id);
  else {
    const ex = db.prepare("SELECT * FROM exhibitors WHERE id = ?").get(id);
    db.prepare("UPDATE exhibitors SET active_until = ? WHERE id = ?").run(d, id);
    maker = makerForExhibitor(ex);
  }
  if (!maker) return;
  db.transaction(() => {
    db.prepare("UPDATE vendors SET agreement_ends = ? WHERE id = ?").run(d, maker.id);
    db.prepare(
      `UPDATE exhibitors SET active_until = ?
        WHERE vendor_id = ? OR (vendor_id IS NULL AND ? <> '' AND lower(contact_email) = ?)`
    ).run(d, maker.id, String(maker.email || "").toLowerCase(), String(maker.email || "").toLowerCase());
  })();
}

/** Link an exhibitor listing to its maker record (or unlink with null). */
export function linkExhibitorToMaker(exhibitorId, vendorId) {
  db.prepare("UPDATE exhibitors SET vendor_id = ? WHERE id = ?").run(vendorId || null, exhibitorId);
}

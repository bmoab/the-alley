import { db } from "./db.js";
import { getVendor, getIntake, needsTerms, agreedSplit, splitFor, ensureVendorToken, artistForVendor, logVendorEvent } from "./inventory.js";
import { getAccountByEmail } from "./accounts.js";
import { formatPayout } from "./payout.js";

/**
 * A maker's or artist's record (server-only): everything that's happened
 * between them and The Alley, the same list on their page and ours — every
 * time they agreed to the terms (with the exact words), drop-offs, what was
 * counted in and whether they confirmed it, payouts, and changes to their
 * terms, share or how they're paid.
 */

/** Every agreement they've made, newest first. */
export function listAgreements(vendorId) {
  return db.prepare("SELECT * FROM vendor_agreements WHERE vendor_id = ? ORDER BY accepted_at DESC, id DESC").all(vendorId);
}

export function getAgreement(vendorId, id) {
  return db.prepare("SELECT * FROM vendor_agreements WHERE vendor_id = ? AND id = ?").get(vendorId, id) || null;
}

/** Stock sheets counted in for them that they haven't confirmed yet, oldest first, with their lines. */
export function intakesToConfirm(vendorId) {
  return db
    .prepare(
      `SELECT s.id FROM stock_intakes s
        WHERE s.vendor_id = ? AND s.confirmed_at IS NULL
          AND (SELECT COALESCE(SUM(qty), 0) FROM stock_intake_lines l WHERE l.intake_id = s.id) > 0
        ORDER BY s.received_on, s.id`
    )
    .all(vendorId)
    .map((r) => getIntake(r.id));
}

/** The maker checks a stock sheet against what they brought in and confirms it, in their own name. */
export function confirmIntake(vendorId, intakeId, name) {
  const n = String(name || "").trim().replace(/\s+/g, " ").slice(0, 120);
  if (!n) throw new Error("Type your name to confirm.");
  const r = db
    .prepare("UPDATE stock_intakes SET confirmed_at = datetime('now'), confirmed_name = ? WHERE id = ? AND vendor_id = ? AND confirmed_at IS NULL")
    .run(n, intakeId, vendorId);
  if (!r.changes) throw new Error("That sheet was already confirmed.");
}

const plural = (n, word) => `${n} ${word}${Math.abs(n) === 1 ? "" : "s"}`;
const money = (n) => `$${Number(n || 0).toFixed(2)}`;

/**
 * The record, newest first: [{ at, kind, title, detail, by, agreementId, intakeId }].
 * `at` is UTC "YYYY-MM-DD HH:MM:SS" (or a venue-local date for things that only
 * carry a day). Everything here is fine for the maker to see.
 */
export function vendorHistory(vendorId) {
  const rows = [];
  for (const a of listAgreements(vendorId)) {
    rows.push({
      at: a.accepted_at,
      kind: "agreed",
      title: `Agreed to the consignment terms${a.split != null ? ` at ${a.split}%` : ""}`,
      detail: `Signed “${a.name}”`,
      agreementId: a.id,
    });
  }
  const dropoffs = db
    .prepare(
      `SELECT d.*, (SELECT COALESCE(SUM(qty), 0) FROM dropoff_lines l WHERE l.dropoff_id = d.id) AS units
         FROM dropoffs d WHERE d.vendor_id = ?`
    )
    .all(vendorId);
  for (const d of dropoffs) {
    rows.push({ at: d.created_at, kind: "dropoff", title: `Listed a drop-off of ${plural(d.units, "item")}`, by: d.submitted_by || null });
    if (d.status === "declined" && d.decided_at) {
      rows.push({ at: d.decided_at, kind: "declined", title: "Drop-off not accepted", detail: d.decline_reason || null, by: d.decided_by });
    }
    if (d.status === "cancelled" && d.decided_at) rows.push({ at: d.decided_at, kind: "cancelled", title: "Drop-off cancelled" });
  }
  const intakes = db
    .prepare(
      `SELECT s.*, (SELECT COALESCE(SUM(qty), 0) FROM stock_intake_lines l WHERE l.intake_id = s.id) AS units,
              (SELECT COALESCE(SUM(qty * price), 0) FROM stock_intake_lines l WHERE l.intake_id = s.id) AS value
         FROM stock_intakes s WHERE s.vendor_id = ?`
    )
    .all(vendorId);
  for (const s of intakes) {
    const back = s.units < 0;
    rows.push({
      at: s.created_at,
      kind: back ? "returned" : "received",
      title: back
        ? `${plural(-s.units, "item")} handed back (sheet #${s.id})`
        : `${plural(s.units, "item")} counted in, ${money(s.value)} at full price (sheet #${s.id})`,
      detail: back ? null : s.confirmed_at ? null : "Not confirmed yet",
      by: s.received_by,
      intakeId: s.id,
    });
    if (s.confirmed_at) {
      rows.push({ at: s.confirmed_at, kind: "confirmed", title: `Confirmed the count on sheet #${s.id}`, detail: `Signed “${s.confirmed_name}”`, intakeId: s.id });
    }
  }
  for (const p of db.prepare("SELECT * FROM consignor_payouts WHERE vendor_id = ?").all(vendorId)) {
    rows.push({
      at: p.created_at,
      kind: "paid",
      title: `Paid ${money(p.amount)} for sales through ${p.through}`,
      detail: [p.method && formatPayout(p.method), p.reference].filter(Boolean).join(" · ") || null,
      by: p.created_by,
    });
  }
  for (const e of db.prepare("SELECT * FROM vendor_events WHERE vendor_id = ?").all(vendorId)) {
    rows.push({ at: e.created_at, kind: e.kind, title: e.summary, by: e.by_name });
  }
  return rows.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

/**
 * What a reminder to them would cover, or null when there's nothing to remind
 * them of: `agree` ("first" | "updated" | "share" | null) and `account`.
 */
export function reminderFor(v) {
  if (!v?.is_active || !v.email) return null;
  const account = getAccountByEmail(v.email);
  const noAccount = !account?.email_verified_at;
  let agree = null;
  if (needsTerms(v)) {
    const was = agreedSplit(v);
    agree = !v.terms_accepted_at ? "first" : was != null && was !== splitFor(null, v) ? "share" : "updated";
  }
  if (!agree && !noAccount) return null;
  return { agree, account: noAccount };
}

/** Everything the reminder email needs: their link, artist wording, share. */
export function reminderContext(v) {
  const r = reminderFor(v);
  if (!r) return null;
  const appUrl = process.env.APP_URL || "";
  const artist = artistForVendor(v);
  const token = ensureVendorToken(v.id);
  return {
    ...r,
    artist: !!artist,
    link: `${appUrl}/maker/${token}${r.agree ? "#terms" : ""}`,
    vendor: { ...getVendor(v.id), share: splitFor(null, v) },
  };
}

export function noteReminder(vendorId, { agree, account }, by) {
  const what = [agree ? "agree to the terms" : null, account ? "make an account" : null].filter(Boolean).join(" and ");
  logVendorEvent(vendorId, "reminder", `The Alley emailed a reminder to ${what}`, by);
}

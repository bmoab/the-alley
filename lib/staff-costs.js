import { db, getSetting } from "./db.js";
import { fetchTimecards, fetchTeam } from "./square-retail.js";
import { createSimpleInvoice, cancelInvoice, getInvoiceStatus, isSquareConfigured } from "./square.js";
import { round2 } from "./inventory.js";
import { shiftDate, venueToday, venueNow } from "./constants.js";
import { weekStart } from "./staff.js";
import { normalizeEmail } from "./portal.js";
import { rememberPayment } from "./payment-details.js";

/**
 * Shared staff cost (server-only).
 *
 * The shop's staff also cover the tenants, so the tenants and the shop split
 * what the staff cost, evenly, every month. A month is the payroll PAID in it:
 * the paychecks dated that month (payday every other Friday), each covering
 * the two Sunday–Saturday weeks ending the Saturday before payday. On the 1st
 * the nightly cron builds LAST month from the hours clocked in Square for
 * those paychecks — wages (weekly overtime past 40 hours at time and a half)
 * plus employer taxes as a set percentage plus a set monthly amount for fees —
 * and emails the bookkeeper. Nothing goes to a tenant until the bookkeeper
 * presses Send: then each tenant gets a Square invoice, due that day, with
 * Square's card fee added on top, and an email with the link — or they can
 * skip the fee by paying another way (Venmo, Zelle) and the bookkeeper marks
 * it paid, which cancels the invoice. The shop's own share is recorded but
 * never billed. During the month the same figures run as "so far" — rebuilt
 * nightly and whenever the page is opened — but can't be sent until the month
 * is over. Hours are priced at each person's rate on their job in Square.
 *
 * Square Payroll's own report is the exact figure; the estimate can be
 * corrected with an adjustment, or replaced outright with that total.
 */

export const MONTH_RE = /^\d{4}-\d{2}$/;
const OT_AFTER = 40;

export function monthLabel(month) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function monthBounds(month) {
  const start = `${month}-01`;
  return { start, end: shiftDate(shiftDate(start, { months: 1 }), { days: -1 }) };
}

export function previousMonth(today = venueToday()) {
  return shiftDate(`${today.slice(0, 7)}-01`, { months: -1 }).slice(0, 7);
}

export function currentMonth(today = venueToday()) {
  return today.slice(0, 7);
}

/**
 * The paychecks dated in `month`: every 14 days counting from the first
 * payday (none before it). Each pays the two Sunday–Saturday weeks ending the
 * Saturday before payday — work Oct 11–24 is paid Friday Oct 30.
 */
export function paychecksIn(month, firstPayday = staffCostSettings().firstPayday) {
  const { start, end } = monthBounds(month);
  const out = [];
  let payday = firstPayday;
  while (payday < start) payday = shiftDate(payday, { days: 14 });
  for (; payday <= end; payday = shiftDate(payday, { days: 14 })) {
    const [y, m, d] = payday.split("-").map(Number);
    const workEnd = shiftDate(payday, { days: -(new Date(y, m - 1, d).getDay() + 1) });
    out.push({ payday, start: shiftDate(workEnd, { days: -13 }), end: workEnd });
  }
  return out;
}

/** The fee Square keeps on a card payment of `amount` plus that fee, so the share arrives whole. */
export function squareFeeOn(amount, { feePct, feeFixed } = staffCostSettings()) {
  if (!(amount > 0) || !(feePct > 0 || feeFixed > 0)) return 0;
  const gross = Math.ceil(((amount + feeFixed) / (1 - feePct / 100)) * 100) / 100;
  return round2(gross - amount);
}

export const PAID_OTHER_WAYS = ["Venmo", "Zelle", "Cash", "Check", "Other"];

/** Over: its last day has passed, so it can be billed. */
export function monthIsOver(month, today = venueToday()) {
  return monthBounds(month).end < today;
}

/**
 * A month as of now: rebuilt from Square's timecards when it was last added up
 * more than `maxAgeMin` minutes ago, so hours and rates changed in Square show
 * up — until its bills have gone out. A Square hiccup keeps the last figures.
 */
export async function freshMonth(month, { maxAgeMin = 10, today = venueToday() } = {}) {
  const m = getMonth(month);
  if (monthBounds(month).start > today || m?.locked) return m;
  if (m?.built_at && Date.now() - Date.parse(m.built_at) < maxAgeMin * 60000) return m;
  try {
    return await buildMonth(month);
  } catch (err) {
    console.error("[staff-costs] couldn't refresh", month, err.message);
    return m;
  }
}

// ---------------------------------------------------------------------------
// Hours → wages (pure)
// ---------------------------------------------------------------------------

const hoursBetween = (a, b) => (new Date(b) - new Date(a)) / 3600000;

/**
 * The pay rate set on their job in Square (Staff → the team member → their
 * job), which the manager keeps up to date — not the rate a timecard happened
 * to be stamped with when it was made. A timecard's own rate is the fallback
 * for someone with no rate on their job.
 */
function rateFor(shift, team) {
  const options = team.rates?.[shift.team_member_id] || [];
  const job = (options.find((o) => o.jobId && o.jobId === shift.wage?.job_id) || options[0])?.rate;
  if (job != null) return job;
  const own = shift.wage?.hourly_rate?.amount;
  return own ? own / 100 : null;
}

/**
 * Square prices each timecard on its own and rounds its pay UP to the cent
 * (3 h 40 min at $14 is $51.34, not $51.33), so the totals here match its
 * Timecards screen to the penny.
 */
const upToCent = (n) => Math.ceil(Number((n * 100).toFixed(6))) / 100;

/**
 * Wages for the work days `start`–`end` from Square timecards. `shifts` must
 * begin at the Sunday on or before `start` so a week that straddles it counts
 * its overtime right: hours past 40 in a Sunday–Saturday week are overtime, in
 * the order worked, and only the shifts that START in the range are counted.
 */
export function wagesFromTimecards(shifts, team, { start, end }) {
  const people = {};
  const warnings = [];
  const weekHours = {};
  const sorted = [...shifts].sort((a, b) => String(a.start_at).localeCompare(String(b.start_at)));
  for (const s of sorted) {
    const day = venueToday(new Date(s.start_at));
    const who = s.team_member_id || s.employee_id || "unknown";
    const name = team.names?.[who] || "Team member";
    if (!s.end_at) {
      if (day >= start && day <= end) warnings.push(`${name} is still clocked in from ${venueNow(new Date(s.start_at))} — not counted. Clock them out in Square and it shows here within a few minutes.`);
      continue;
    }
    const unpaid = (s.breaks || [])
      .filter((b) => !b.is_paid && b.end_at)
      .reduce((sum, b) => sum + hoursBetween(b.start_at, b.end_at), 0);
    const hours = Math.max(0, hoursBetween(s.start_at, s.end_at) - unpaid);
    const wk = `${who}|${weekStart(day)}`;
    const before = weekHours[wk] || 0;
    weekHours[wk] = before + hours;
    if (day < start || day > end) continue;
    const reg = Math.min(hours, Math.max(0, OT_AFTER - before));
    const ot = hours - reg;
    const rate = rateFor(s, team);
    const p = (people[who] ||= { id: who, name, hours: 0, otHours: 0, rate, wages: 0, missingRate: false, weeks: {} });
    // The same figures by Sunday–Saturday week, to line up with Square's weekly Timecards screen.
    const w = (p.weeks[weekStart(day)] ||= { hours: 0, otHours: 0, wages: 0 });
    p.hours += hours;
    p.otHours += ot;
    w.hours += hours;
    w.otHours += ot;
    if (rate == null) p.missingRate = true;
    else {
      p.rate = rate;
      const pay = upToCent(reg * rate + ot * rate * 1.5);
      p.wages += pay;
      w.wages += pay;
    }
  }
  const roundWeeks = (weeks) =>
    Object.fromEntries(
      Object.entries(weeks).map(([k, w]) => [k, { hours: round2(w.hours), otHours: round2(w.otHours), wages: round2(w.wages) }])
    );
  const list = Object.values(people)
    .map((p) => ({ ...p, hours: round2(p.hours), otHours: round2(p.otHours), wages: round2(p.wages), weeks: roundWeeks(p.weeks) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const p of list) {
    if (p.missingRate) warnings.push(`${p.name} has no pay rate in Square, so their ${p.hours} hours aren't priced. Add it in Square (Staff → their job) and it shows here within a few minutes — or enter Square Payroll's total below.`);
  }
  return {
    people: list,
    hours: round2(list.reduce((s, p) => s + p.hours, 0)),
    otHours: round2(list.reduce((s, p) => s + p.otHours, 0)),
    wages: round2(list.reduce((s, p) => s + p.wages, 0)),
    warnings,
  };
}

/** Split `total` evenly; the shop (last) takes the leftover cent so the shares add up exactly. */
export function splitEvenly(total, parties) {
  if (!parties.length) return [];
  const each = Math.floor((total / parties.length) * 100) / 100;
  return parties.map((p, i) => ({ ...p, amount: i === parties.length - 1 ? round2(total - each * (parties.length - 1)) : each }));
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export function getMonth(month) {
  const row = db.prepare("SELECT * FROM staff_cost_months WHERE month = ?").get(month);
  if (!row) return null;
  let detail = {};
  try {
    detail = JSON.parse(row.detail || "{}");
  } catch {}
  const shares = db
    .prepare("SELECT * FROM staff_cost_shares WHERE month_id = ? ORDER BY directory_id IS NULL, name COLLATE NOCASE")
    .all(row.id);
  const locked = shares.some((s) => s.status === "sent" || s.status === "paid");
  return { ...row, detail, shares, locked };
}

export function listMonths() {
  return db
    .prepare(
      `SELECT m.month, m.total,
              SUM(CASE WHEN s.directory_id IS NOT NULL THEN 1 ELSE 0 END) AS billed,
              SUM(CASE WHEN s.status = 'paid' THEN 1 ELSE 0 END) AS paid,
              SUM(CASE WHEN s.status = 'sent' THEN 1 ELSE 0 END) AS sent
         FROM staff_cost_months m LEFT JOIN staff_cost_shares s ON s.month_id = m.id
        GROUP BY m.id ORDER BY m.month DESC`
    )
    .all();
}

/** Directory businesses, tenants (they hold a suite) first, with who pays a share. */
export function shareCandidates() {
  return db
    .prepare(
      `SELECT d.id, d.business_name, d.contact_email, d.billing_email, d.shares_staff_cost,
              EXISTS (SELECT 1 FROM suite_tenants st WHERE st.tenant_id = d.id) AS is_tenant
         FROM directory d
        ORDER BY d.shares_staff_cost DESC, is_tenant DESC, d.business_name COLLATE NOCASE`
    )
    .all();
}

function payingTenants() {
  return db
    .prepare("SELECT id, business_name, COALESCE(NULLIF(billing_email, ''), contact_email) AS email FROM directory WHERE shares_staff_cost = 1 ORDER BY business_name COLLATE NOCASE")
    .all();
}

export const DEFAULT_FIRST_PAYDAY = "2026-10-30";

export function staffCostSettings() {
  const num = (key, fallback) => {
    const n = Number(getSetting(key, fallback));
    return Number.isFinite(n) ? n : Number(fallback);
  };
  const payday = getSetting("staff_cost_first_payday", DEFAULT_FIRST_PAYDAY);
  return {
    taxPct: Number(getSetting("staff_cost_tax_pct", "7.65")) || 0,
    monthlyFees: Number(getSetting("staff_cost_monthly_fees", "0")) || 0,
    firstPayday: /^\d{4}-\d{2}-\d{2}$/.test(payday || "") ? payday : DEFAULT_FIRST_PAYDAY,
    // Square's online card rate on the Free plan: 3.3% + 30¢.
    feePct: num("staff_cost_fee_pct", "3.3"),
    feeFixed: num("staff_cost_fee_fixed", "0.30"),
    // How to pay without the fee, e.g. "Venmo @name or Zelle 435-…" — shown on the bill.
    payOther: getSetting("staff_cost_pay_other", "") || "",
  };
}

// ---------------------------------------------------------------------------
// Building and editing a month
// ---------------------------------------------------------------------------

/** Total from the month's figures, then fresh draft shares — unless a bill already went out. */
function recalc(monthId) {
  const m = db.prepare("SELECT * FROM staff_cost_months WHERE id = ?").get(monthId);
  const estimate = round2(m.wages + m.taxes + m.fees + m.adjustment);
  const total = round2(m.override_total ?? estimate);
  db.prepare("UPDATE staff_cost_months SET total = ? WHERE id = ?").run(total, monthId);
  const shares = db.prepare("SELECT status FROM staff_cost_shares WHERE month_id = ?").all(monthId);
  if (shares.some((s) => s.status === "sent" || s.status === "paid")) return;
  const parties = [
    ...payingTenants().map((t) => ({ directory_id: t.id, name: t.business_name, email: t.email || null })),
    { directory_id: null, name: "The Alley shop", email: null },
  ];
  const tx = db.transaction(() => {
    // Keep each tenant's attempt number: a share that was billed and then
    // cancelled must never reuse the cancelled invoice's idempotency key.
    const attempts = Object.fromEntries(
      db.prepare("SELECT directory_id, attempt FROM staff_cost_shares WHERE month_id = ? AND directory_id IS NOT NULL").all(monthId).map((r) => [r.directory_id, r.attempt])
    );
    db.prepare("DELETE FROM staff_cost_shares WHERE month_id = ?").run(monthId);
    const ins = db.prepare("INSERT INTO staff_cost_shares (month_id, directory_id, name, email, amount, attempt) VALUES (?, ?, ?, ?, ?, ?)");
    for (const p of splitEvenly(total, parties)) ins.run(monthId, p.directory_id, p.name, p.email, p.amount, attempts[p.directory_id] || 1);
  });
  tx();
}

/**
 * Build (or rebuild) `month` from Square's timecards. Keeps any adjustment,
 * Square Payroll total and note already entered. Refused once a bill is out.
 */
export async function buildMonth(month) {
  if (!MONTH_RE.test(month)) throw new Error("Pick a month.");
  const existing = getMonth(month);
  if (existing?.locked) throw new Error("Bills for this month have gone out — cancel them first to rebuild it.");
  const checks = paychecksIn(month);
  let w = { people: [], hours: 0, otHours: 0, wages: 0, warnings: [] };
  let simulated = false;
  if (checks.length) {
    const range = { start: checks[0].start, end: checks[checks.length - 1].end };
    const [tc, team] = await Promise.all([fetchTimecards(weekStart(range.start), range.end), fetchTeam()]);
    simulated = tc.simulated;
    w = wagesFromTimecards(tc.shifts, team, range);
  }
  // Each paycheck's share of the hours: its two weeks, from everyone's week-by-week figures.
  const paychecks = checks.map((c) => {
    const inIt = (wk) => wk >= c.start && wk <= c.end;
    let hours = 0, wages = 0;
    for (const p of w.people) {
      for (const [wk, x] of Object.entries(p.weeks)) {
        if (inIt(wk)) {
          hours += x.hours;
          wages += x.wages;
        }
      }
    }
    return { ...c, hours: round2(hours), wages: round2(wages) };
  });
  const warnings = [...w.warnings];
  if (!checks.length) warnings.push(`No paydays fall in ${monthLabel(month)}, so there's no payroll to share.`);
  if (simulated) warnings.unshift("Square isn't connected here, so there are no timecards — enter the total from Square Payroll below.");
  if (!payingTenants().length) warnings.push("No tenants are set to pay a share yet — pick them under “Who pays” below.");
  const { taxPct, monthlyFees } = staffCostSettings();
  const taxes = round2((w.wages * taxPct) / 100);
  const detail = JSON.stringify({ people: w.people, paychecks, warnings });
  const now = new Date().toISOString();
  if (existing) {
    db.prepare(
      "UPDATE staff_cost_months SET hours = ?, ot_hours = ?, wages = ?, tax_pct = ?, taxes = ?, fees = ?, detail = ?, built_at = ? WHERE id = ?"
    ).run(w.hours, w.otHours, w.wages, taxPct, taxes, monthlyFees, detail, now, existing.id);
    recalc(existing.id);
  } else {
    const id = db
      .prepare(
        "INSERT INTO staff_cost_months (month, hours, ot_hours, wages, tax_pct, taxes, fees, detail, built_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(month, w.hours, w.otHours, w.wages, taxPct, taxes, monthlyFees, detail, now).lastInsertRowid;
    recalc(id);
  }
  return getMonth(month);
}

const money = (v) => {
  const s = String(v ?? "").replace(/[$,\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error("That amount doesn't look like a number.");
  return round2(n);
};

/** The bookkeeper's corrections: an adjustment (+/−), Square Payroll's exact total, a note. */
export function saveMonthEdits(month, { adjustment, overrideTotal, note }) {
  const m = getMonth(month);
  if (!m) throw new Error("Build the month first.");
  if (m.locked) throw new Error("Bills for this month have gone out — cancel them first to change it.");
  const override = money(overrideTotal);
  if (override != null && override < 0) throw new Error("The total can't be negative.");
  db.prepare("UPDATE staff_cost_months SET adjustment = ?, override_total = ?, note = ? WHERE id = ?").run(
    money(adjustment) ?? 0,
    override,
    String(note || "").trim() || null,
    m.id
  );
  recalc(m.id);
  return getMonth(month);
}

/** Redo an unsent month's shares (after changing who pays). */
export function refreshShares(month) {
  const m = getMonth(month);
  if (m && !m.locked) recalc(m.id);
}

/** Who pays, where their bill goes, and the cost settings. Unsent months pick it up on their next save or rebuild. */
export function saveSetup({ payers, billingEmails, taxPct, monthlyFees, firstPayday, feePct, feeFixed, payOther }) {
  const tx = db.transaction(() => {
    db.prepare("UPDATE directory SET shares_staff_cost = 0").run();
    const on = db.prepare("UPDATE directory SET shares_staff_cost = 1 WHERE id = ?");
    for (const id of payers) on.run(Number(id));
    const be = db.prepare("UPDATE directory SET billing_email = ? WHERE id = ?");
    for (const [id, email] of Object.entries(billingEmails)) {
      const clean = String(email || "").trim();
      if (clean && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error(`“${clean}” doesn't look like an email address.`);
      be.run(clean ? normalizeEmail(clean) : null, Number(id));
    }
    const pct = Number(taxPct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 30) throw new Error("Employer taxes should be a percent between 0 and 30.");
    const fees = money(monthlyFees) ?? 0;
    if (fees < 0) throw new Error("Monthly fees can't be negative.");
    db.prepare("INSERT INTO settings (key, value) VALUES ('staff_cost_tax_pct', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(pct));
    db.prepare("INSERT INTO settings (key, value) VALUES ('staff_cost_monthly_fees', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(fees));
    const payday = String(firstPayday || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(payday)) throw new Error("Pick the first payday.");
    const feeP = Number(String(feePct ?? "").trim() || 0);
    if (!Number.isFinite(feeP) || feeP < 0 || feeP > 10) throw new Error("Square's card fee should be a percent between 0 and 10.");
    const feeF = money(feeFixed) ?? 0;
    if (feeF < 0 || feeF > 5) throw new Error("Square's per-payment fee should be between $0 and $5.");
    const set = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
    set.run("staff_cost_first_payday", payday);
    set.run("staff_cost_fee_pct", String(feeP));
    set.run("staff_cost_fee_fixed", String(feeF));
    set.run("staff_cost_pay_other", String(payOther || "").trim().slice(0, 200));
  });
  tx();
}

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

/**
 * Bill every tenant share of `month` that hasn't gone out (draft or failed):
 * a Square invoice due today, and an email with the link. One failure doesn't
 * stop the rest; it's marked and can be sent again.
 */
export async function sendMonth(month, { by, email }) {
  const m = getMonth(month);
  if (!m) throw new Error("Build the month first.");
  if (!monthIsOver(month)) throw new Error(`${monthLabel(month)} isn't over yet — bills go out once it ends.`);
  const due = venueToday();
  const label = monthLabel(month);
  const settings = staffCostSettings();
  const results = { sent: 0, failed: 0 };
  for (const s of m.shares) {
    if (s.directory_id == null || !["draft", "failed", "cancelled"].includes(s.status)) continue;
    if (!s.email) {
      db.prepare("UPDATE staff_cost_shares SET status = 'failed', error = ? WHERE id = ?").run("No email — add a billing email under “Who pays”.", s.id);
      results.failed++;
      continue;
    }
    if (!(s.amount > 0)) {
      db.prepare("UPDATE staff_cost_shares SET status = 'failed', error = ? WHERE id = ?").run("Nothing to bill.", s.id);
      results.failed++;
      continue;
    }
    // A retry keeps the fee the invoice was first made with.
    const fee = s.square_invoice_id && s.square_fee != null ? s.square_fee : squareFeeOn(s.amount, settings);
    try {
      const inv = await createSimpleInvoice({
        key: `alley-staffshare-${s.id}-${s.attempt}`,
        invoiceId: s.square_invoice_id,
        name: s.name,
        email: s.email,
        lineName: `Shared staff cost — ${label}`,
        title: `The Alley On Center — shared staff cost, ${label}`,
        amount: s.amount,
        fee,
        // Named like the share so the sales sync keeps it out of shop sales and sales tax.
        feeName: "Shared staff cost — Square card fee",
        dueDate: due,
      });
      // Save the invoice before emailing, so a failed email never bills twice.
      db.prepare(
        "UPDATE staff_cost_shares SET status = 'sent', square_invoice_id = ?, payment_link = ?, square_fee = ?, error = NULL, sent_at = ?, sent_by = ? WHERE id = ?"
      ).run(inv.invoiceId, inv.paymentLink, fee, new Date().toISOString(), by || null, s.id);
      try {
        await email(
          { ...s, payment_link: inv.paymentLink, square_fee: fee },
          { month, label, total: m.total, parties: m.shares.length, paychecks: m.detail.paychecks || [], payOther: settings.payOther }
        );
      } catch (err) {
        console.error("[staff-costs] tenant email failed:", err.message);
        db.prepare("UPDATE staff_cost_shares SET error = ? WHERE id = ?").run("Invoice made, but the email didn't send — copy the link and send it.", s.id);
      }
      results.sent++;
    } catch (err) {
      console.error("[staff-costs] invoice failed:", err.message);
      db.prepare("UPDATE staff_cost_shares SET status = 'failed', error = ? WHERE id = ?").run(err.message.slice(0, 300), s.id);
      results.failed++;
    }
  }
  return results;
}

/** Cancel one tenant's unpaid bill. Sending again makes a fresh invoice. */
export async function cancelShare(shareId) {
  const s = db.prepare("SELECT * FROM staff_cost_shares WHERE id = ?").get(shareId);
  if (!s || s.directory_id == null) throw new Error("Couldn't find that bill.");
  if (s.status === "paid") throw new Error("That one's paid — refund it in Square instead.");
  if (s.square_invoice_id) {
    const r = await cancelInvoice(s.square_invoice_id);
    if (r.skipped === "already_paid") {
      db.prepare("UPDATE staff_cost_shares SET status = 'paid', paid_at = ? WHERE id = ?").run(new Date().toISOString(), s.id);
      throw new Error("It was already paid in Square — marked paid.");
    }
  }
  db.prepare(
    "UPDATE staff_cost_shares SET status = 'cancelled', square_invoice_id = NULL, payment_link = NULL, square_fee = NULL, error = NULL, attempt = attempt + 1 WHERE id = ?"
  ).run(s.id);
}

/**
 * A tenant paid another way (Venmo, Zelle, cash, check): mark their share
 * paid and cancel its Square invoice, so the link stops working and nothing
 * shows as owed. If Square says it was paid there after all, that's recorded
 * instead.
 */
export async function markSharePaid(shareId, { method, by } = {}) {
  const s = db.prepare("SELECT s.*, m.month FROM staff_cost_shares s JOIN staff_cost_months m ON m.id = s.month_id WHERE s.id = ?").get(shareId);
  if (!s || s.directory_id == null) throw new Error("Couldn't find that bill.");
  if (s.status === "paid") throw new Error("That one's already marked paid.");
  if (!monthIsOver(s.month)) throw new Error(`${monthLabel(s.month)} isn't over yet — its share can still change.`);
  const how = PAID_OTHER_WAYS.includes(method) ? method : "Other";
  if (s.square_invoice_id) {
    const r = await cancelInvoice(s.square_invoice_id);
    if (r.skipped === "already_paid") {
      db.prepare("UPDATE staff_cost_shares SET status = 'paid', paid_at = ? WHERE id = ?").run(new Date().toISOString(), s.id);
      await rememberPayment(s.square_invoice_id);
      return { viaSquare: true };
    }
  }
  db.prepare(
    `UPDATE staff_cost_shares SET status = 'paid', paid_at = ?, paid_method = ?, paid_by = ?, square_invoice_id = NULL,
            payment_link = NULL, square_fee = NULL, error = NULL, attempt = attempt + 1 WHERE id = ?`
  ).run(new Date().toISOString(), how, by || null, s.id);
  return { viaSquare: false };
}

/** Mark bills paid that Square says are paid. */
export async function refreshPayments() {
  if (!isSquareConfigured()) return { checked: 0, paid: 0 };
  const open = db.prepare("SELECT id, square_invoice_id FROM staff_cost_shares WHERE status = 'sent' AND square_invoice_id IS NOT NULL").all();
  let paid = 0;
  for (const s of open) {
    try {
      if ((await getInvoiceStatus(s.square_invoice_id)) === "paid") {
        db.prepare("UPDATE staff_cost_shares SET status = 'paid', paid_at = ? WHERE id = ?").run(new Date().toISOString(), s.id);
        await rememberPayment(s.square_invoice_id);
        paid++;
      }
    } catch (err) {
      console.error("[staff-costs] status check failed:", err.message);
    }
  }
  return { checked: open.length, paid };
}

/**
 * The nightly step: from the 1st on, make sure last month is built and the
 * bookkeeper has been told once; then check which bills have been paid.
 */
export async function staffCostDaily({ notify, today = venueToday() } = {}) {
  const month = previousMonth(today);
  let m = getMonth(month);
  let built = false;
  // Last month, until its bills go out, picks up any hours or rates fixed in
  // Square since; this month so far keeps the running figures current.
  if (!m?.locked) {
    m = await buildMonth(month);
    built = true;
  }
  await freshMonth(currentMonth(today), { maxAgeMin: 0, today });
  let notified = false;
  if (!m.notified_at && notify) {
    await notify(m);
    db.prepare("UPDATE staff_cost_months SET notified_at = ? WHERE id = ?").run(new Date().toISOString(), m.id);
    notified = true;
  }
  const payments = await refreshPayments();
  return { month, built, notified, ...payments };
}

// ---------------------------------------------------------------------------
// What a tenant sees: their rent link and their staff-cost bills
// ---------------------------------------------------------------------------

/** Save a tenant's rent amount and pay link (both optional). */
export function setTenantRent(directoryId, { amount, link }) {
  const n = money(amount);
  if (n != null && n < 0) throw new Error("Rent can't be negative.");
  const url = String(link || "").trim();
  if (url && !/^https:\/\/\S+$/i.test(url)) throw new Error("The rent link should start with https://");
  db.prepare("UPDATE directory SET rent_amount = ?, rent_link = ? WHERE id = ?").run(n, url || null, Number(directoryId));
}

/**
 * A tenant's money with The Alley: rent (if the owner set it) and their
 * staff-cost bills — the unpaid ones, then the last few paid.
 */
export function tenantBills(directoryId) {
  const d = db.prepare("SELECT id, business_name, rent_amount, rent_link FROM directory WHERE id = ?").get(Number(directoryId));
  if (!d) return null;
  const shares = db
    .prepare(
      `SELECT s.id, s.amount, s.square_fee, s.status, s.payment_link, s.paid_method, s.sent_at, s.paid_at, m.month
         FROM staff_cost_shares s JOIN staff_cost_months m ON m.id = s.month_id
        WHERE s.directory_id = ? AND s.status IN ('sent', 'paid')
        ORDER BY m.month DESC`
    )
    .all(d.id)
    .map((r) => ({ ...r, label: `Shared staff cost — ${monthLabel(r.month)}` }));
  return {
    rent: d.rent_amount || d.rent_link ? { amount: d.rent_amount, link: d.rent_link } : null,
    payOther: staffCostSettings().payOther,
    unpaid: shares.filter((r) => r.status === "sent"),
    paid: shares.filter((r) => r.status === "paid").slice(0, 3),
  };
}

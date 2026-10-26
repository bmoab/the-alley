import { db, getSetting } from "./db.js";
import { fetchTimecards, fetchTeam } from "./square-retail.js";
import { createSimpleInvoice, cancelInvoice, getInvoiceStatus, isSquareConfigured } from "./square.js";
import { round2 } from "./inventory.js";
import { shiftDate, venueToday, venueNow } from "./constants.js";
import { weekStart } from "./staff.js";
import { normalizeEmail } from "./portal.js";

/**
 * Shared staff cost (server-only).
 *
 * The shop's staff also cover the tenants, so the tenants and the shop split
 * what the staff cost, evenly, every month. On the 1st the nightly cron builds
 * LAST month from the hours clocked in Square — wages (weekly overtime past 40
 * hours at time and a half) plus employer taxes as a set percentage plus a set
 * monthly amount for fees — and emails the bookkeeper. Nothing goes to a tenant
 * until the bookkeeper presses Send: then each tenant gets a Square invoice,
 * due that day, and an email with the link. The shop's own share is recorded
 * but never billed. During the month the same figures run as "so far" —
 * rebuilt nightly and whenever the page is opened — but can't be sent until
 * the month is over. Hours are priced at each person's rate on their job in Square.
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
 * Wages for `month` from Square timecards. `shifts` must start at the Sunday
 * before the month so a week that straddles the 1st counts its overtime right:
 * hours past 40 in a Sunday–Saturday week are overtime, in the order worked,
 * and only the shifts that START in the month are counted toward it.
 */
export function wagesFromTimecards(shifts, team, month) {
  const { start, end } = monthBounds(month);
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

export function staffCostSettings() {
  return {
    taxPct: Number(getSetting("staff_cost_tax_pct", "7.65")) || 0,
    monthlyFees: Number(getSetting("staff_cost_monthly_fees", "0")) || 0,
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
  const { start, end } = monthBounds(month);
  const [{ shifts, simulated }, team] = await Promise.all([fetchTimecards(weekStart(start), end), fetchTeam()]);
  const w = wagesFromTimecards(shifts, team, month);
  const warnings = [...w.warnings];
  if (simulated) warnings.unshift("Square isn't connected here, so there are no timecards — enter the total from Square Payroll below.");
  if (!payingTenants().length) warnings.push("No tenants are set to pay a share yet — pick them under “Who pays” below.");
  const { taxPct, monthlyFees } = staffCostSettings();
  const taxes = round2((w.wages * taxPct) / 100);
  const detail = JSON.stringify({ people: w.people, warnings });
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
export function saveSetup({ payers, billingEmails, taxPct, monthlyFees }) {
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
    try {
      const inv = await createSimpleInvoice({
        key: `alley-staffshare-${s.id}-${s.attempt}`,
        invoiceId: s.square_invoice_id,
        name: s.name,
        email: s.email,
        lineName: `Shared staff cost — ${label}`,
        title: `The Alley On Center — shared staff cost, ${label}`,
        amount: s.amount,
        dueDate: due,
      });
      // Save the invoice before emailing, so a failed email never bills twice.
      db.prepare(
        "UPDATE staff_cost_shares SET status = 'sent', square_invoice_id = ?, payment_link = ?, error = NULL, sent_at = ?, sent_by = ? WHERE id = ?"
      ).run(inv.invoiceId, inv.paymentLink, new Date().toISOString(), by || null, s.id);
      try {
        await email({ ...s, payment_link: inv.paymentLink }, { month, label, total: m.total, parties: m.shares.length });
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
    "UPDATE staff_cost_shares SET status = 'cancelled', square_invoice_id = NULL, payment_link = NULL, error = NULL, attempt = attempt + 1 WHERE id = ?"
  ).run(s.id);
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
      `SELECT s.id, s.amount, s.status, s.payment_link, s.sent_at, s.paid_at, m.month
         FROM staff_cost_shares s JOIN staff_cost_months m ON m.id = s.month_id
        WHERE s.directory_id = ? AND s.status IN ('sent', 'paid')
        ORDER BY m.month DESC`
    )
    .all(d.id)
    .map((r) => ({ ...r, label: `Shared staff cost — ${monthLabel(r.month)}` }));
  return {
    rent: d.rent_amount || d.rent_link ? { amount: d.rent_amount, link: d.rent_link } : null,
    unpaid: shares.filter((r) => r.status === "sent"),
    paid: shares.filter((r) => r.status === "paid").slice(0, 3),
  };
}

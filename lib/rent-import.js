import { db, getContentValue } from "./db.js";
import { csvRows, parseAmount, parseDate } from "./bank.js";
import { markRent } from "./money.js";

/**
 * Rent from a TurboTenant "charges" export (server-only).
 *
 * Tenants pay rent in TurboTenant, which also holds leases that aren't The
 * Alley's (houses, other buildings). This reads the export, keeps only leases
 * at The Alley's address, works out the tenant from the suite numbers in the
 * lease title ("19 W Center St 202/203 March 2026" → suites 202 and 203 →
 * Massage Genesis), and ticks their rent paid for the month it was due.
 * A tenant with no monthly rent set gets it from the export.
 *
 * Only RENT charges count toward rent; the amount recorded is what's been
 * paid (the charge less what's still due). Re-uploading the same file is
 * harmless: a month already ticked is left as it is.
 */

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/\bstreet\b/g, "st")
    .replace(/\bwest\b/g, "w")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** The Alley's street address, normalised: "19 w center st". */
function alleyStreet() {
  const addr = getContentValue("contact_address", "19 W Center St., Logan, UT 84321");
  return norm(String(addr).split(",")[0]) || "19 w center st";
}

/** Suite → tenants, keyed by the suite's number ("000" and "00" both → 0). */
function suiteTenants() {
  const map = new Map();
  for (const r of db
    .prepare(
      `SELECT s.zone, s.name, st.tenant_id FROM suites s JOIN suite_tenants st ON st.suite_id = s.id`
    )
    .all()) {
    for (const label of [r.zone, r.name]) {
      if (!/^\d+$/.test(String(label || ""))) continue;
      const k = Number(label);
      if (!map.has(k)) map.set(k, new Set());
      map.get(k).add(r.tenant_id);
    }
  }
  return map;
}

/** "19 W Center St 202/203 March 2026" (street already removed) → [202, 203]. */
function suiteNumbers(rest) {
  return [...String(rest).matchAll(/(?<![\d])(\d{1,3})(?![\d])/g)].map((m) => Number(m[1]));
}

/**
 * Read the export without changing anything:
 * { rows: [{ lease, month, due, paid, rentAmount, tenantId, tenantName, why }], other: [lease…] }
 * `why` says why a row won't be ticked (unpaid, no matching tenant…).
 */
export function readTurboTenantCharges(text) {
  const rows = csvRows(String(text || "").replace(/^﻿/, ""));
  const head = rows.findIndex((r) => r.some((c) => /lease title/i.test(c)) && r.some((c) => /due date/i.test(c)));
  if (head < 0) throw new Error("That doesn't look like a TurboTenant charges export (no “Lease Title” column).");
  const h = rows[head].map((c) => c.toLowerCase());
  const col = (name) => h.findIndex((c) => c === name);
  const iDue = col("due date");
  const iCat = col("category");
  const iDesc = col("description");
  const iLease = col("lease title");
  const iStatus = col("status");
  const iAmt = col("amount");
  const iOwed = col("amount due");

  const street = alleyStreet();
  const suites = suiteTenants();
  const names = Object.fromEntries(db.prepare("SELECT id, business_name FROM directory").all().map((d) => [d.id, d.business_name.trim()]));

  const out = [];
  const other = new Set();
  for (const r of rows.slice(head + 1)) {
    const lease = (r[iLease] || "").trim();
    if (!lease) continue;
    const n = norm(lease);
    if (!n.startsWith(street)) {
      other.add(lease);
      continue;
    }
    if (iCat >= 0 && !/^rent$/i.test(r[iCat] || "")) continue; // fees aren't rent
    const due = parseDate(r[iDue]);
    const amount = parseAmount(r[iAmt]) ?? 0;
    const owed = iOwed >= 0 ? parseAmount(r[iOwed]) ?? 0 : 0;
    // Paid so far: the charge less what's still due (a partial payment counts).
    const paid = iOwed >= 0 ? Math.max(0, amount - owed) : /^paid$/i.test(r[iStatus] || "") ? amount : 0;
    // "Rent ($1,000.00)" in the description is the monthly rent itself.
    const stated = parseAmount(((r[iDesc] || "").match(/rent\s*\(([^)]+)\)/i) || [])[1]);
    const nums = suiteNumbers(n.slice(street.length));
    const ids = new Set(nums.flatMap((k) => [...(suites.get(k) || [])]));
    const tenantId = ids.size === 1 ? [...ids][0] : null;
    out.push({
      lease,
      due,
      month: due ? due.slice(0, 7) : null,
      paid: Math.round(paid * 100) / 100,
      rentAmount: stated ?? amount,
      tenantId,
      tenantName: tenantId ? names[tenantId] : null,
      why: !due
        ? "no due date"
        : !tenantId
          ? ids.size > 1
            ? `suites ${nums.join("/")} have more than one tenant`
            : nums.length
              ? `no tenant in suite ${nums.join("/")}`
              : "no suite number in the lease title"
          : paid <= 0
            ? "not paid yet"
            : null,
    });
  }
  return { rows: out, other: [...other] };
}

/**
 * Tick rent paid from the export. Returns
 * { marked: [{ name, month, amount }], already: n, skipped: [{ lease, why }], other: [lease…], rentSet: [name…], months: [...] }
 */
export function importTurboTenantCharges(text) {
  const { rows, other } = readTurboTenantCharges(text);
  const marked = [];
  const skipped = [];
  const rentSet = [];
  let already = 0;

  // One payment per tenant per month, even if TurboTenant split it in two.
  const groups = new Map();
  for (const r of rows) {
    if (r.why) {
      skipped.push({ lease: r.lease, why: r.why });
      continue;
    }
    const k = `${r.tenantId}|${r.month}`;
    const g = groups.get(k) || { ...r, paid: 0, lastDue: r.due };
    g.paid += r.paid;
    if (r.due > g.lastDue) g.lastDue = r.due;
    groups.set(k, g);
  }

  const has = db.prepare("SELECT 1 FROM rent_payments WHERE directory_id = ? AND month = ?");
  const rentOf = db.prepare("SELECT rent_amount FROM directory WHERE id = ?");
  const setRent = db.prepare("UPDATE directory SET rent_amount = ? WHERE id = ? AND (rent_amount IS NULL OR rent_amount <= 0)");
  db.transaction(() => {
    for (const g of groups.values()) {
      if (!(rentOf.get(g.tenantId)?.rent_amount > 0) && g.rentAmount > 0) {
        setRent.run(g.rentAmount, g.tenantId);
        rentSet.push(g.tenantName);
      }
      if (has.get(g.tenantId, g.month)) {
        already++;
        continue;
      }
      const amount = Math.round(g.paid * 100) / 100;
      markRent(g.tenantId, g.month, { amount, receivedOn: g.lastDue, note: "From TurboTenant" });
      marked.push({ name: g.tenantName, month: g.month, amount });
    }
  })();

  const months = [...new Set(rows.map((r) => r.month).filter(Boolean))].sort();
  return { marked, already, skipped, other, rentSet, months };
}

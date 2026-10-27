import { db } from "./db.js";
import { salesSummary, consignorBalances, shopCatalog, round2, defaultSplit } from "./inventory.js";
import { MONTH_RE, monthBounds, monthLabel, previousMonth } from "./staff-costs.js";
import { createSimpleInvoice, cancelInvoice, getInvoiceStatus, isSquareConfigured } from "./square.js";
import { rentalAmount } from "./bookings.js";
import { shiftDate, spaceName, venueToday } from "./constants.js";
import { normalizeEmail } from "./portal.js";
import { rememberPayment } from "./payment-details.js";

/**
 * The Money page (server-only): the whole Alley's finances for a month, in
 * plain terms — what came in, what went out, what's owed each way, and where
 * the business is doing best and worst.
 *
 * Most of it is read from what the site already knows: register sales and
 * room-rental invoices (synced from Square), the makers' share, staff cost,
 * tenants' and co-payers' bills. What only a person knows — the mortgage and
 * utility bills, and which tenant has paid rent — is entered on the page.
 *
 * Money in is what The Alley KEEPS: a maker's item counts only The Alley's
 * share, and refundable deposits and sales tax (owed to the state) are shown
 * apart, never as income.
 */

export { MONTH_RE, monthLabel, previousMonth };
export const thisMonth = () => venueToday().slice(0, 7);

export const CATEGORIES = {
  mortgage: "Mortgage",
  utility: "Utilities",
  insurance: "Insurance",
  tax: "Property tax",
  supplies: "Supplies & upkeep",
  other: "Other",
};

/** A share as people say it: "1/3", "100%", "25%" (a third is stored as 33.3333 so the cents come out right). */
export function shareLabel(pct) {
  const p = Number(pct) || 0;
  if (Math.abs(p - 100 / 3) < 0.01) return "1/3";
  if (Math.abs(p - 200 / 3) < 0.01) return "2/3";
  return `${+p.toFixed(2)}%`;
}

/** "1/3", "33.3333", "25%" or "100" → a percent. */
export function parseShare(v) {
  const s = String(v ?? "").trim().replace(/%$/, "");
  if (!s) return 0;
  const frac = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) return Math.round((Number(frac[1]) / Number(frac[2])) * 1000000) / 10000;
  return Number(s);
}

const sum = (arr, f = (x) => x) => round2(arr.reduce((t, x) => t + (Number(f(x)) || 0), 0));
const money = (v) => {
  const s = String(v ?? "").replace(/[$,\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error("That amount doesn't look like a number.");
  return round2(n);
};

// ---------------------------------------------------------------------------
// Bills (expenses)
// ---------------------------------------------------------------------------

export function listAccounts({ activeOnly = false } = {}) {
  return db
    .prepare(`SELECT * FROM expense_accounts ${activeOnly ? "WHERE is_active = 1" : ""} ORDER BY is_active DESC, sort_order, name COLLATE NOCASE`)
    .all();
}

function dueDateFor(month, day) {
  if (!day) return null;
  const { end } = monthBounds(month);
  const d = Math.min(Number(day), Number(end.slice(8, 10)));
  return `${month}-${String(d).padStart(2, "0")}`;
}

/** This month's row for every active bill, made on first look (amount blank until it's entered). */
export function billsFor(month) {
  const ins = db.prepare("INSERT OR IGNORE INTO expenses (account_id, month, amount, due_date) VALUES (?, ?, ?, ?)");
  db.transaction(() => {
    for (const a of listAccounts({ activeOnly: true })) ins.run(a.id, month, a.typical_amount ?? null, dueDateFor(month, a.due_day));
  })();
  return db
    .prepare(
      `SELECT e.*, a.name, a.category, a.share_pct, a.share_name, a.share_email, a.typical_amount
         FROM expenses e JOIN expense_accounts a ON a.id = e.account_id
        WHERE e.month = ? ORDER BY a.sort_order, a.name COLLATE NOCASE`
    )
    .all(month)
    .map((e) => ({ ...e, share: e.amount && e.share_pct ? round2((e.amount * e.share_pct) / 100) : 0 }));
}

export function saveBill(id, { amount, paidOn, note }) {
  const a = money(amount);
  if (a != null && a < 0) throw new Error("A bill can't be negative.");
  db.prepare("UPDATE expenses SET amount = ?, paid_on = ?, note = ? WHERE id = ?").run(
    a,
    paidOn ? String(paidOn).slice(0, 10) : null,
    String(note || "").trim() || null,
    Number(id)
  );
}

export function saveAccount(d) {
  const name = String(d.name || "").trim();
  if (!name) throw new Error("Give the bill a name.");
  const category = CATEGORIES[d.category] ? d.category : "other";
  const typical = money(d.typical_amount);
  const day = d.due_day ? Math.min(31, Math.max(1, Number(d.due_day) || 1)) : null;
  const pct = parseShare(d.share_pct);
  if (!Number.isFinite(pct)) throw new Error("Their share should look like 1/3, 50% or 100.");
  if (pct < 0 || pct > 100) throw new Error("A share is a percent between 0 and 100.");
  const shareName = String(d.share_name || "").trim() || null;
  const shareEmail = String(d.share_email || "").trim();
  if (shareEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(shareEmail)) throw new Error(`“${shareEmail}” doesn't look like an email address.`);
  if (pct && !shareName) throw new Error("Who pays the share? Add their name.");
  const vals = [name, category, typical, day, pct, pct ? shareName : null, pct && shareEmail ? normalizeEmail(shareEmail) : null];
  if (d.id) {
    db.prepare(
      "UPDATE expense_accounts SET name = ?, category = ?, typical_amount = ?, due_day = ?, share_pct = ?, share_name = ?, share_email = ?, is_active = ? WHERE id = ?"
    ).run(...vals, d.is_active === false ? 0 : 1, Number(d.id));
    return Number(d.id);
  }
  return db
    .prepare("INSERT INTO expense_accounts (name, category, typical_amount, due_day, share_pct, share_name, share_email, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, 999)")
    .run(...vals).lastInsertRowid;
}

// ---------------------------------------------------------------------------
// Co-payers' share (Jay's third of the utilities)
// ---------------------------------------------------------------------------

/** Each co-payer's share of `month`'s bills, with what's been billed already. */
export function sharesFor(month) {
  const bills = billsFor(month).filter((b) => b.share_pct > 0 && b.share_name);
  const byName = {};
  for (const b of bills) {
    const k = b.share_name;
    const p = (byName[k] ||= { name: k, email: b.share_email || null, items: [], amount: 0, missing: [] });
    if (!p.email && b.share_email) p.email = b.share_email;
    if (b.amount == null) p.missing.push(b.name);
    else {
      p.items.push({ name: b.name, bill: b.amount, pct: b.share_pct, share: b.share });
      p.amount = round2(p.amount + b.share);
    }
  }
  const billed = Object.fromEntries(db.prepare("SELECT * FROM share_bills WHERE month = ?").all(month).map((r) => [r.name, r]));
  return Object.values(byName).map((p) => ({ ...p, bill: billed[p.name] || null }));
}

/** Send a co-payer one Square invoice for their share of the month's bills, due in 14 days. */
export async function billShare(month, name, { email: sendEmail }) {
  const p = sharesFor(month).find((x) => x.name === name);
  if (!p) throw new Error("Nothing to bill.");
  if (!p.email) throw new Error(`Add ${name}'s email on the bill settings first.`);
  if (!(p.amount > 0)) throw new Error("Enter this month's bills first.");
  if (p.bill && ["sent", "paid"].includes(p.bill.status)) throw new Error(`${name} has already been billed for ${monthLabel(month)}.`);
  const attempt = p.bill ? p.bill.attempt : 1;
  const detail = JSON.stringify(p.items);
  const row = p.bill
    ? (db.prepare("UPDATE share_bills SET amount = ?, email = ?, detail = ?, status = 'sending', error = NULL WHERE id = ?").run(p.amount, p.email, detail, p.bill.id), p.bill.id)
    : db.prepare("INSERT INTO share_bills (month, name, email, amount, detail, status) VALUES (?, ?, ?, ?, ?, 'sending')").run(month, name, p.email, p.amount, detail).lastInsertRowid;
  const label = monthLabel(month);
  try {
    const inv = await createSimpleInvoice({
      key: `alley-utilshare-${row}-${attempt}`,
      name,
      email: p.email,
      lineName: `Utility share — ${label}`,
      title: `The Alley On Center — your share of ${label}'s utilities`,
      amount: p.amount,
      dueDate: shiftDate(venueToday(), { days: 14 }),
    });
    db.prepare("UPDATE share_bills SET status = 'sent', square_invoice_id = ?, payment_link = ?, sent_at = ? WHERE id = ?").run(
      inv.invoiceId,
      inv.paymentLink,
      new Date().toISOString(),
      row
    );
    try {
      await sendEmail({ name, email: p.email, amount: p.amount, items: p.items, link: inv.paymentLink, label });
    } catch (err) {
      db.prepare("UPDATE share_bills SET error = ? WHERE id = ?").run("Invoice made, but the email didn't send — copy the link and send it.", row);
    }
  } catch (err) {
    db.prepare("UPDATE share_bills SET status = 'failed', error = ? WHERE id = ?").run(err.message.slice(0, 300), row);
    throw err;
  }
}

export async function cancelShareBill(id) {
  const b = db.prepare("SELECT * FROM share_bills WHERE id = ?").get(Number(id));
  if (!b) throw new Error("Couldn't find that bill.");
  if (b.status === "paid") throw new Error("That one's paid.");
  if (b.square_invoice_id) await cancelInvoice(b.square_invoice_id);
  db.prepare("UPDATE share_bills SET status = 'cancelled', square_invoice_id = NULL, payment_link = NULL, attempt = attempt + 1 WHERE id = ?").run(b.id);
}

export function markShareBillPaid(id) {
  db.prepare("UPDATE share_bills SET status = 'paid', paid_at = ? WHERE id = ?").run(new Date().toISOString(), Number(id));
}

/** Nightly: mark co-payer bills paid that Square says are paid. */
export async function refreshShareBillPayments() {
  if (!isSquareConfigured()) return { checked: 0, paid: 0 };
  const open = db.prepare("SELECT id, square_invoice_id FROM share_bills WHERE status = 'sent' AND square_invoice_id IS NOT NULL").all();
  let paid = 0;
  for (const b of open) {
    try {
      if ((await getInvoiceStatus(b.square_invoice_id)) === "paid") {
        markShareBillPaid(b.id);
        await rememberPayment(b.square_invoice_id);
        paid++;
      }
    } catch (err) {
      console.error("[money] share bill status failed:", err.message);
    }
  }
  return { checked: open.length, paid };
}

// ---------------------------------------------------------------------------
// Rent
// ---------------------------------------------------------------------------

/** Every tenant with rent set, and whether `month` is paid. */
export function rentFor(month) {
  const paid = Object.fromEntries(db.prepare("SELECT * FROM rent_payments WHERE month = ?").all(month).map((r) => [r.directory_id, r]));
  return db
    .prepare("SELECT id, business_name, rent_amount, rent_link FROM directory WHERE rent_amount > 0 ORDER BY business_name COLLATE NOCASE")
    .all()
    .map((d) => ({ ...d, payment: paid[d.id] || null }));
}

export function markRent(directoryId, month, { amount, receivedOn, note } = {}) {
  const d = db.prepare("SELECT rent_amount FROM directory WHERE id = ?").get(Number(directoryId));
  if (!d) throw new Error("Couldn't find that tenant.");
  const a = money(amount) ?? d.rent_amount;
  db.prepare(
    `INSERT INTO rent_payments (directory_id, month, amount, received_on, note) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (directory_id, month) DO UPDATE SET amount = excluded.amount, received_on = excluded.received_on, note = excluded.note`
  ).run(Number(directoryId), month, a, receivedOn || venueToday(), String(note || "").trim() || null);
}

export function unmarkRent(directoryId, month) {
  db.prepare("DELETE FROM rent_payments WHERE directory_id = ? AND month = ?").run(Number(directoryId), month);
}

// ---------------------------------------------------------------------------
// The month, added up
// ---------------------------------------------------------------------------

/** The month's numbers, light enough to run for a year of months. */
export function monthTotals(month) {
  const { start, end } = monthBounds(month);
  const s = salesSummary(start, end);
  const kind = (k) => sum(s.lines.filter((l) => l.kind === k), (l) => l.net);
  const staff = db.prepare("SELECT total FROM staff_cost_months WHERE month = ?").get(month);
  const tenantShares = db
    .prepare(
      `SELECT COALESCE(SUM(s.amount), 0) AS n FROM staff_cost_shares s JOIN staff_cost_months m ON m.id = s.month_id
        WHERE m.month = ? AND s.directory_id IS NOT NULL AND s.status IN ('sent', 'paid')`
    )
    .get(month).n;
  const bills = db
    .prepare(
      `SELECT e.amount, e.paid_on, a.category FROM expenses e JOIN expense_accounts a ON a.id = e.account_id WHERE e.month = ? AND e.amount IS NOT NULL`
    )
    .all(month);
  const coPayers = db.prepare("SELECT COALESCE(SUM(amount), 0) AS n FROM share_bills WHERE month = ? AND status IN ('sent', 'paid')").get(month).n;
  const rent = db.prepare("SELECT COALESCE(SUM(amount), 0) AS n FROM rent_payments WHERE month = ?").get(month).n;

  const income = {
    shop: round2(s.owned.net + s.shopShareOfConsigned),
    rentals: round2(s.rental.net),
    tickets: round2(s.tickets.net),
    rent: round2(rent),
    staffShares: round2(tenantShares),
    coPayers: round2(coPayers),
  };
  const byCat = (c) => sum(bills.filter((b) => b.category === c), (b) => b.amount);
  const costs = {
    makers: round2(s.consignorShare),
    staff: staff ? round2(staff.total) : 0,
    mortgage: byCat("mortgage"),
    utilities: byCat("utility"),
    insurance: byCat("insurance"),
    tax: byCat("tax"),
    supplies: byCat("supplies"),
    other: byCat("other"),
  };
  const totalIn = sum(Object.values(income));
  const totalOut = sum(Object.values(costs));
  return {
    month,
    income,
    costs,
    totalIn,
    totalOut,
    net: round2(totalIn - totalOut),
    salesTax: round2(s.all.tax),
    depositsTaken: round2(kind("deposit")),
    shopSales: round2(s.retail.net),
    staffAddedUp: Boolean(staff),
    sales: s,
  };
}

/** The last `n` months ending with `month`, oldest first — for the trend chart. */
export function trend(month, n = 12) {
  const months = Array.from({ length: n }, (_, i) => shiftDate(`${month}-01`, { months: i - (n - 1) }).slice(0, 7));
  return months.map((m) => {
    const t = monthTotals(m);
    return { month: m, in: t.totalIn, out: t.totalOut, net: t.net };
  });
}

/** Room rentals in `month` by space: bookings, hours and rental income (event date, not payment date). */
function roomsFor(month) {
  const { start, end } = monthBounds(month);
  const rows = db
    .prepare(
      `SELECT * FROM bookings WHERE date >= ? AND date <= ? AND archived = 0
          AND status IN ('confirmed', 'completed', 'held', 'reserved')`
    )
    .all(start, end);
  const by = {};
  for (const b of rows) {
    const r = (by[b.space] ||= { space: b.space, name: spaceName(b.space), bookings: 0, hours: 0, amount: 0 });
    r.bookings++;
    r.hours += (Number(b.hours) || 0) * Math.max(1, Number(b.sessions) || 1);
    r.amount = round2(r.amount + (Number(b.total) === 0 ? 0 : rentalAmount(b)));
  }
  return Object.values(by).sort((a, b) => b.amount - a.amount);
}

/** Makers ranked by what sold this month, plus those with stock that hasn't sold in 60 days. */
function makersFor(month) {
  const { start, end } = monthBounds(month);
  const top = db
    .prepare(
      `SELECT v.id, v.name, SUM(s.net) AS net, SUM(s.qty) AS qty
         FROM retail_sales s JOIN inventory_items i ON i.id = s.item_id JOIN vendors v ON v.id = i.vendor_id
        WHERE s.kind = 'retail' AND s.sold_at >= ? AND s.sold_at <= ?
        GROUP BY v.id ORDER BY net DESC`
    )
    .all(`${start} 00:00`, `${end} 23:59`)
    .map((r) => ({ ...r, net: round2(r.net) }));
  const since = `${shiftDate(venueToday(), { days: -60 })} 00:00`;
  const slow = db
    .prepare(
      `SELECT v.id, v.name, SUM(i.qty_on_hand) AS on_shelf
         FROM inventory_items i JOIN vendors v ON v.id = i.vendor_id
        WHERE i.qty_on_hand > 0 AND v.is_active = 1
          AND NOT EXISTS (SELECT 1 FROM retail_sales s JOIN inventory_items i2 ON i2.id = s.item_id
                           WHERE i2.vendor_id = v.id AND s.sold_at >= ? AND s.is_return = 0)
        GROUP BY v.id ORDER BY on_shelf DESC`
    )
    .all(since);
  return { top, slow };
}

function topItemsFor(month) {
  const { start, end } = monthBounds(month);
  return db
    .prepare(
      `SELECT s.name, SUM(s.qty) AS qty, SUM(s.net) AS net FROM retail_sales s
        WHERE s.kind = 'retail' AND s.sold_at >= ? AND s.sold_at <= ?
        GROUP BY s.name ORDER BY net DESC LIMIT 8`
    )
    .all(`${start} 00:00`, `${end} 23:59`)
    .map((r) => ({ ...r, net: round2(r.net) }));
}

/** What others owe The Alley right now, and what The Alley owes. */
function owing(month) {
  const today = venueToday();
  const rents = rentFor(month);
  const rentDue = sum(rents.filter((r) => !r.payment), (r) => r.rent_amount);
  const staffBills = db.prepare("SELECT COALESCE(SUM(amount), 0) AS n FROM staff_cost_shares WHERE status = 'sent'").get().n;
  const coPayers = db.prepare("SELECT COALESCE(SUM(amount), 0) AS n FROM share_bills WHERE status = 'sent'").get().n;
  const bookingRows = db
    .prepare(
      `SELECT * FROM bookings WHERE archived = 0 AND status IN ('held', 'confirmed', 'reserved')
          AND COALESCE(payment_status, 'unpaid') = 'unpaid' AND total > 0`
    )
    .all();
  const bookingsDue = sum(bookingRows, (b) => rentalAmount(b));
  const unpaidBills = db
    .prepare(
      `SELECT e.*, a.name FROM expenses e JOIN expense_accounts a ON a.id = e.account_id
        WHERE e.paid_on IS NULL AND e.amount > 0 AND e.month <= ? ORDER BY e.due_date`
    )
    .all(month);
  const makersOwed = sum(Object.values(consignorBalances({})), (b) => b.owed);
  return {
    toUs: { rent: rentDue, staffBills: round2(staffBills), coPayers: round2(coPayers), bookings: bookingsDue },
    fromUs: {
      bills: sum(unpaidBills, (b) => b.amount),
      overdue: unpaidBills.filter((b) => b.due_date && b.due_date < today),
      makers: makersOwed,
    },
  };
}

let stockCache = { at: 0, value: null };
/**
 * What's on the shelves, at shelf price, split the way the money splits:
 * stock The Alley BOUGHT (all of it is ours when it sells) and makers'
 * CONSIGNED items (we keep only our share). Event tickets aren't stock.
 * Square is asked at most every 10 minutes.
 */
export async function stockValue() {
  if (stockCache.value && Date.now() - stockCache.at < 10 * 60 * 1000) return stockCache.value;
  try {
    const { rows, simulated } = await shopCatalog();
    const tickets = new Set(db.prepare("SELECT square_ticket_variation_id AS v FROM events WHERE square_ticket_variation_id IS NOT NULL").all().map((r) => r.v));
    const splits = Object.fromEntries(
      db
        .prepare("SELECT i.id, COALESCE(i.split, v.default_split, ?) AS split, v.id AS vendor_id FROM inventory_items i LEFT JOIN vendors v ON v.id = i.vendor_id")
        .all(defaultSplit())
        .map((r) => [r.id, r])
    );
    const counted = rows.filter((r) => r.count > 0 && r.price > 0 && !tickets.has(r.variationId));
    const consigned = counted.filter((r) => r.maker);
    const bought = counted.filter((r) => !r.maker);
    const group = (list, keyOf) => {
      const g = {};
      for (const r of list) {
        const k = keyOf(r) || "Uncategorized";
        const x = (g[k] ||= { name: k, units: 0, products: 0, value: 0, ours: 0, vendorId: null });
        x.units += r.count;
        x.products++;
        x.value = round2(x.value + r.count * r.price);
        const sp = splits[r.localItemId];
        if (r.maker) {
          x.vendorId = sp?.vendor_id ?? null;
          x.ours = round2(x.ours + (r.count * r.price * (100 - (sp?.split ?? defaultSplit()))) / 100);
        }
      }
      return Object.values(g).sort((a, b) => b.value - a.value);
    };
    const makers = group(consigned, (r) => r.maker);
    const value = {
      simulated,
      units: sum(counted, (r) => r.count),
      products: counted.length,
      total: sum(counted, (r) => r.count * r.price),
      bought: {
        units: sum(bought, (r) => r.count),
        products: bought.length,
        value: sum(bought, (r) => r.count * r.price),
        byCategory: group(bought, (r) => r.categoryName),
      },
      consigned: {
        units: sum(consigned, (r) => r.count),
        products: consigned.length,
        value: sum(consigned, (r) => r.count * r.price),
        ours: sum(makers, (m) => m.ours),
        byMaker: makers,
      },
    };
    stockCache = { at: Date.now(), value };
    return value;
  } catch (err) {
    console.error("[money] stock value:", err.message);
    return null;
  }
}

/** Everything the Money page shows for `month`. */
export async function moneyOverview(month) {
  const t = monthTotals(month);
  const last = monthTotals(shiftDate(`${month}-01`, { months: -1 }).slice(0, 7));
  const { start, end } = monthBounds(month);
  const events = db
    .prepare("SELECT COUNT(*) AS n FROM events WHERE status = 'live' AND date >= ? AND date <= ?")
    .get(start, end).n;
  return {
    ...t,
    last,
    trend: trend(month),
    rooms: roomsFor(month),
    makers: makersFor(month),
    topItems: topItemsFor(month),
    owing: owing(month),
    rent: rentFor(month),
    bills: billsFor(month),
    shares: sharesFor(month),
    events,
    stock: await stockValue(),
  };
}

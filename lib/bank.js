import crypto from "node:crypto";
import { db } from "./db.js";
import { round2 } from "./inventory.js";
import { billsFor, listAccounts } from "./money.js";

/**
 * Bank statements, uploaded by hand: download the transactions from online
 * banking (CSV, or the Quicken/QuickBooks file — QFX, OFX, QBO) and upload it
 * on Money → Bank. Nothing connects to the bank; the site only ever sees the
 * file. Lines already in are skipped, so overlapping files are fine.
 *
 * Each line gets a category — automatically from the built-in payees below or
 * a "remember this payee" rule, otherwise by hand. A payment sorted to a
 * tracked bill fills in that bill (amount and paid date) if it's still open.
 * Only "Supplies & upkeep", "Other spending" and "Other income" add to the
 * Money page's totals; everything else is already counted from its own
 * source (sales, staff cost, Jay's bill, rent ticks) or isn't ours.
 */

export const BANK_CATEGORIES = {
  supplies: { label: "Supplies & upkeep", dir: "out", counts: true },
  other: { label: "Other spending", dir: "out", counts: true },
  staff: { label: "Staff pay", dir: "out", note: "counted from Shared staff cost" },
  makers: { label: "Maker payouts", dir: "out", note: "counted from sales" },
  salestax: { label: "Sales tax paid", dir: "out", note: "the state's money" },
  square: { label: "Square deposits", dir: "in", note: "counted from sales" },
  rent: { label: "Rent (TurboTenant)", dir: "in", note: "tick each tenant's rent on Money" },
  copayer: { label: "Jay / co-payer", dir: "in", note: "counted from Bills" },
  income: { label: "Other income", dir: "in", counts: true },
  transfer: { label: "Transfer / owner", dir: "both", note: "not income or spending" },
};

// ---------------------------------------------------------------------------
// Reading the file
// ---------------------------------------------------------------------------

const ymd = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** "11/03/2026", "11/3/26", "2026-11-03", "20261103…" → "2026-11-03", else null. */
export function parseDate(v) {
  const s = String(v || "").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return ymd(m[1], m[2], m[3]);
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})\b/);
  if (m) return ymd(m[3].length === 2 ? `20${m[3]}` : m[3], m[1], m[2]);
  m = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m) return ymd(m[1], m[2], m[3]);
  return null;
}

/** "$1,234.56", "(12.00)", "-12", "12.00-" → number, or null when blank. */
export function parseAmount(v) {
  let s = String(v ?? "").trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (/-$/.test(s)) {
    neg = true;
    s = s.slice(0, -1);
  }
  s = s.replace(/[$,\s]/g, "");
  if (s.startsWith("-")) {
    neg = !neg;
    s = s.slice(1);
  } else if (s.startsWith("+")) s = s.slice(1);
  if (!/^\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return round2(neg ? -n : n);
}

export function csvRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some(Boolean));
}

const pick = (headers, patterns) => {
  for (const re of patterns) {
    const i = headers.findIndex((h) => re.test(h));
    if (i >= 0) return i;
  }
  return -1;
};

function parseCsv(text) {
  const rows = csvRows(text);
  // Some banks put a few lines of account details above the column names.
  const hi = rows.slice(0, 20).findIndex((r) => {
    const h = r.map((c) => c.toLowerCase());
    return h.some((c) => /date/.test(c)) && h.some((c) => /amount|debit|credit|withdraw|deposit/.test(c));
  });
  if (hi < 0) throw new Error("Couldn't find the columns in that file — it needs a date and an amount (or debit and credit) column.");
  const headers = rows[hi].map((c) => c.toLowerCase().replace(/\s+/g, " ").trim());
  const col = {
    date: pick(headers, [/^post(ed|ing)? date$/, /^date posted$/, /^date$/, /^trans(action|\.)? date$/, /date/]),
    desc: pick(headers, [/^description$/, /^(payee|name|merchant)$/, /description/, /payee|merchant/, /^details$/, /^memo$/]),
    memo: pick(headers, [/^memo$/, /extended description|additional/]),
    amount: pick(headers, [/^amount$/, /^transaction amount$/, /^amount \(/, /^amount/]),
    debit: pick(headers, [/^debit/, /withdraw/, /money out/, /^payments?$/, /debit/]),
    credit: pick(headers, [/^credit/, /deposit/, /money in/, /credit/]),
    balance: pick(headers, [/balance/]),
    type: pick(headers, [/^(transaction )?type$/, /credit\/debit|debit\/credit/]),
    status: pick(headers, [/^status$/]),
    check: pick(headers, [/check/]),
  };
  if (col.date < 0) throw new Error("Couldn't find a date column in that file.");
  if (col.amount < 0 && col.debit < 0 && col.credit < 0) throw new Error("Couldn't find an amount column in that file.");
  if (col.memo === col.desc) col.memo = -1;
  const at = (r, i) => (i >= 0 ? r[i] ?? "" : "");
  const lines = [];
  for (const r of rows.slice(hi + 1)) {
    const posted = parseDate(at(r, col.date));
    if (!posted) continue;
    if (/pending/i.test(at(r, col.status))) continue;
    let amount = null;
    if (col.amount >= 0) {
      amount = parseAmount(at(r, col.amount));
      const type = at(r, col.type).toLowerCase();
      if (amount != null && amount > 0 && /^(debit|dr|withdrawal|sale|payment)/.test(type)) amount = -amount;
    }
    if (amount == null && (col.debit >= 0 || col.credit >= 0)) {
      const d = parseAmount(at(r, col.debit));
      const c = parseAmount(at(r, col.credit));
      if (d == null && c == null) continue;
      amount = round2((c ? Math.abs(c) : 0) - (d ? Math.abs(d) : 0));
    }
    if (amount == null || amount === 0) continue;
    const desc = [at(r, col.desc), at(r, col.memo)].filter(Boolean).join(" · ") || (at(r, col.check) ? `Check ${at(r, col.check)}` : "(no description)");
    lines.push({ posted, amount, description: desc.slice(0, 300), balance: parseAmount(at(r, col.balance)) });
  }
  // The newest running balance, if the file has one.
  let balance = null;
  let balanceOn = null;
  const withBal = lines.filter((l) => l.balance != null);
  if (withBal.length) {
    const newestFirst = withBal.length > 1 && withBal[0].posted >= withBal[withBal.length - 1].posted && withBal[0].posted !== withBal[withBal.length - 1].posted;
    const newest = newestFirst ? withBal[0] : withBal[withBal.length - 1];
    balance = newest.balance;
    balanceOn = newest.posted;
  }
  // A line's id: what it is plus which of the identical ones it is in the file.
  const seen = {};
  for (const l of lines) {
    const base = `${l.posted}|${l.amount.toFixed(2)}|${l.description.toUpperCase().replace(/\s+/g, " ")}`;
    seen[base] = (seen[base] || 0) + 1;
    l.uid = `csv:${crypto.createHash("sha1").update(`${base}|${seen[base]}`).digest("hex").slice(0, 20)}`;
    delete l.balance;
  }
  return { kind: "CSV", lines, balance, balanceOn, last4: null };
}

function parseOfx(text) {
  const tag = (block, name) => {
    const m = block.match(new RegExp(`<${name}>([^<\\r\\n]*)`, "i"));
    return m ? m[1].trim() : "";
  };
  const decode = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&apos;/g, "'").replace(/&quot;/g, '"');
  const lines = [];
  for (const m of text.matchAll(/<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi)) {
    const b = m[1];
    const posted = parseDate(tag(b, "DTPOSTED"));
    const amount = parseAmount(tag(b, "TRNAMT"));
    if (!posted || amount == null || amount === 0) continue;
    const name = decode(tag(b, "NAME"));
    const memo = decode(tag(b, "MEMO"));
    const checkNo = tag(b, "CHECKNUM");
    const description = [name, memo && memo !== name ? memo : ""].filter(Boolean).join(" · ") || (checkNo ? `Check ${checkNo}` : "(no description)");
    const fitid = tag(b, "FITID");
    const uid = fitid
      ? `ofx:${fitid}`
      : `ofx:${crypto.createHash("sha1").update(`${posted}|${amount}|${description}`).digest("hex").slice(0, 20)}`;
    lines.push({ posted, amount, description: description.slice(0, 300), uid });
  }
  if (!lines.length && !/<STMTTRN>/i.test(text)) throw new Error("That file has no transactions in it.");
  const acct = tag(text, "ACCTID").replace(/\D/g, "");
  const ledger = text.match(/<LEDGERBAL>([\s\S]*?)(<\/LEDGERBAL>|<AVAILBAL>|$)/i);
  return {
    kind: "OFX",
    lines,
    balance: ledger ? parseAmount(tag(ledger[1], "BALAMT")) : null,
    balanceOn: ledger ? parseDate(tag(ledger[1], "DTASOF")) : null,
    last4: acct ? acct.slice(-4) : null,
  };
}

/** Read a downloaded statement: OFX/QFX/QBO or CSV. */
export function parseBankFile(text) {
  const t = String(text || "").replace(/^﻿/, "");
  if (!t.trim()) throw new Error("That file is empty.");
  if (/OFXHEADER|<OFX>/i.test(t)) return parseOfx(t);
  return parseCsv(t);
}

// ---------------------------------------------------------------------------
// Payees and rules
// ---------------------------------------------------------------------------

const NOISE = [
  /\b(pos|debit card|check ?card|visa|mc|recurring|preauthorized|pre-auth|ach|electronic|online|mobile|web|bill ?pay(ment)?|purchase|payment|withdrawal|deposit|transfer|authorized on|card \d+|ppd|ccd|web id:?|id:?|ref(erence)?:?|des:?|indn:?|co id:?)\b/gi,
];

/** The part of a bank description that names who it was: "POS PURCHASE HOME DEPOT #4402 LOGAN UT" → "HOME DEPOT". */
export function payeeKey(description) {
  // Description and memo together: some banks put the payee in the memo
  // ("Withdrawal Debit Card · WALMART #1234").
  let s = String(description || "").replace(/ · /g, " ").toUpperCase();
  s = s.replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, " ");
  for (const re of NOISE) s = s.replace(re, " ");
  s = s.replace(/[#*]/g, " ").replace(/\b[A-Z]*\d[\dA-Z]*\b/g, " ").replace(/[^A-Z&' ]+/g, " ").replace(/\s+/g, " ").trim();
  // Town and state trail a card purchase ("HOME DEPOT LOGAN UT"), but "LOGAN CITY" is a payee.
  const words = s.split(" ").filter((w, i) => w.length > 1 && !/^(INC|LLC|CO|PMT|PYMT)$/.test(w) && !(i > 0 && /^(UT|UTAH|LOGAN)$/.test(w)));
  return words.slice(0, 3).join(" ") || String(description || "").toUpperCase().slice(0, 30).trim();
}

const accountLike = (re) => listAccounts({ activeOnly: true }).find((a) => re.test(a.name)) || null;

/** What the line most likely is, from the payees every Alley statement has. */
function builtInGuess(l) {
  const d = String(l.description || "");
  const out = l.amount < 0;
  if (!out && /\bsquare\b|\bsq inc\b|gosq/i.test(d)) return { category: "square" };
  if (!out && /turbo ?tenant/i.test(d)) return { category: "rent" };
  if (out && /enbridge|dominion energy/i.test(d)) {
    const a = accountLike(/enbridge|\bgas\b/i);
    return a ? { category: "bill", accountId: a.id } : null;
  }
  if (out && /logan city/i.test(d)) {
    const a = accountLike(/logan city|power|water/i);
    return a ? { category: "bill", accountId: a.id } : null;
  }
  if (out && /comcast|xfinity/i.test(d)) {
    const a = accountLike(/comcast|internet/i);
    return a ? { category: "bill", accountId: a.id } : null;
  }
  if (out && /utah state tax|tax ?comm|ut state tc|stc tax/i.test(d)) return { category: "salestax" };
  // Moving money between the business's own accounts, incl. paying the card off.
  if (/\btransfer\b|\bxfer\b|payment thank you|autopay(ment)? (received|thank)/i.test(d)) return { category: "transfer" };
  if (out && /service (charge|fee)|monthly (maintenance )?fee|overdraft|nsf fee/i.test(d)) return { category: "other" };
  if (!out && /zelle|venmo/i.test(d)) {
    const payers = listAccounts({ activeOnly: true }).map((a) => a.share_name).filter(Boolean);
    if (payers.some((n) => new RegExp(`\\b${n.replace(/[^\w ]/g, "")}\\b`, "i").test(d))) return { category: "copayer" };
  }
  return null;
}

function ruleGuess(l, rules) {
  const key = payeeKey(l.description);
  const dir = l.amount < 0 ? "out" : "in";
  const r = rules.find((x) => x.dir === dir && (key === x.match || key.startsWith(`${x.match} `) || String(l.description).toUpperCase().includes(x.match)));
  return r ? { category: r.category, accountId: r.expense_account_id, ruleId: r.id } : null;
}

export function listRules() {
  return db
    .prepare(
      `SELECT r.*, a.name AS account_name FROM bank_rules r LEFT JOIN expense_accounts a ON a.id = r.expense_account_id
        ORDER BY r.match COLLATE NOCASE`
    )
    .all();
}

export function deleteRule(id) {
  db.prepare("DELETE FROM bank_rules WHERE id = ?").run(Number(id));
}

// ---------------------------------------------------------------------------
// Bank accounts and uploads
// ---------------------------------------------------------------------------

export function listBankAccounts() {
  return db
    .prepare(
      `SELECT b.*, (SELECT COUNT(*) FROM bank_txns t WHERE t.account_id = b.id) AS lines,
              (SELECT MAX(posted) FROM bank_txns t WHERE t.account_id = b.id) AS newest,
              (SELECT MAX(created_at) FROM bank_imports i WHERE i.account_id = b.id) AS last_upload
         FROM bank_accounts b ORDER BY b.name COLLATE NOCASE`
    )
    .all();
}

export function recentImports(limit = 8) {
  return db
    .prepare(
      `SELECT i.*, b.name AS account_name, (SELECT COUNT(*) FROM bank_txns t WHERE t.import_id = i.id) AS still_in
         FROM bank_imports i JOIN bank_accounts b ON b.id = i.account_id ORDER BY i.id DESC LIMIT ?`
    )
    .all(limit);
}

/**
 * Add a downloaded statement to an account (or a new one by name). Returns
 * what happened: { account, added, skipped, autoSorted, filled, from, to }.
 */
export function importBankFile({ text, filename = "", accountId = null, newName = "", flip = false, by = null }) {
  const parsed = parseBankFile(text);
  if (!parsed.lines.length) throw new Error("No transactions found in that file.");
  if (flip) for (const l of parsed.lines) l.amount = -l.amount;

  let account = accountId ? db.prepare("SELECT * FROM bank_accounts WHERE id = ?").get(Number(accountId)) : null;
  if (accountId && !account) throw new Error("Couldn't find that account.");
  if (!account) {
    const name = String(newName || "").trim() || (parsed.last4 ? `Account ··${parsed.last4}` : "");
    if (!name) throw new Error("Name the account this file is from (e.g. Checking).");
    account = db.prepare("SELECT * FROM bank_accounts WHERE name = ? COLLATE NOCASE").get(name);
    if (!account) {
      const id = db.prepare("INSERT INTO bank_accounts (name, last4) VALUES (?, ?)").run(name, parsed.last4).lastInsertRowid;
      account = db.prepare("SELECT * FROM bank_accounts WHERE id = ?").get(id);
    }
  }
  if (parsed.last4 && account.last4 && parsed.last4 !== account.last4) {
    throw new Error(`That file is for the account ending ${parsed.last4}, not ${account.name} (ending ${account.last4}).`);
  }

  const rules = db.prepare("SELECT * FROM bank_rules").all();
  const ins = db.prepare(
    `INSERT OR IGNORE INTO bank_txns (account_id, uid, posted, amount, description, category, expense_account_id, auto, import_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  let added = 0;
  let autoSorted = 0;
  const filled = [];
  const dates = parsed.lines.map((l) => l.posted).sort();
  db.transaction(() => {
    if (parsed.last4 && !account.last4) db.prepare("UPDATE bank_accounts SET last4 = ? WHERE id = ?").run(parsed.last4, account.id);
    const importId = db
      .prepare("INSERT INTO bank_imports (account_id, filename, kind, rows, from_date, to_date, by_name) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(account.id, String(filename).slice(0, 200), parsed.kind, parsed.lines.length, dates[0], dates[dates.length - 1], by).lastInsertRowid;
    for (const l of parsed.lines) {
      const g = ruleGuess(l, rules) || builtInGuess(l);
      const r = ins.run(account.id, l.uid, l.posted, l.amount, l.description, g?.category || null, g?.accountId || null, g ? 1 : 0, importId);
      if (!r.changes) continue;
      added++;
      if (g) {
        autoSorted++;
        if (g.category === "bill") {
          const f = fillBill({ id: r.lastInsertRowid, posted: l.posted, amount: l.amount, expense_account_id: g.accountId });
          if (f) filled.push(f);
        }
      }
    }
    db.prepare("UPDATE bank_imports SET added = ? WHERE id = ?").run(added, importId);
    if (parsed.balance != null && parsed.balanceOn && (!account.balance_on || parsed.balanceOn >= account.balance_on)) {
      db.prepare("UPDATE bank_accounts SET balance = ?, balance_on = ? WHERE id = ?").run(parsed.balance, parsed.balanceOn, account.id);
    }
  })();
  return { account, added, skipped: parsed.lines.length - added, autoSorted, filled, from: dates[0], to: dates[dates.length - 1] };
}

/** Take an upload back out (its lines, sorted or not). Bills it filled stay as they are. */
export function undoImport(id) {
  const imp = db.prepare("SELECT * FROM bank_imports WHERE id = ?").get(Number(id));
  if (!imp) throw new Error("Couldn't find that upload.");
  const n = db.transaction(() => {
    const r = db.prepare("DELETE FROM bank_txns WHERE import_id = ?").run(imp.id);
    db.prepare("DELETE FROM bank_imports WHERE id = ?").run(imp.id);
    return r.changes;
  })();
  return n;
}

export function setBalance(accountId, { balance, on }) {
  const b = parseAmount(balance);
  if (b == null) throw new Error("Type the balance, like 12,345.67.");
  const d = parseDate(on) || new Date().toISOString().slice(0, 10);
  db.prepare("UPDATE bank_accounts SET balance = ?, balance_on = ? WHERE id = ?").run(b, d, Number(accountId));
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

/**
 * A payment sorted to a tracked bill fills that month's bill when it isn't
 * marked paid yet. Returns "Logan City — Nov 2026" when it did, else null.
 */
function fillBill(t) {
  if (!t.expense_account_id || !(t.amount < 0)) return null;
  const month = t.posted.slice(0, 7);
  billsFor(month); // makes the month's bill rows if nobody has looked yet
  const e = db.prepare("SELECT e.*, a.name FROM expenses e JOIN expense_accounts a ON a.id = e.account_id WHERE e.account_id = ? AND e.month = ?").get(t.expense_account_id, month);
  if (!e || e.paid_on) return null;
  db.prepare("UPDATE expenses SET amount = ?, paid_on = ?, note = COALESCE(note, ?) WHERE id = ?").run(round2(-t.amount), t.posted, "From the bank statement", e.id);
  const [y, mo] = month.split("-").map(Number);
  return `${e.name.split(/ \(| — /)[0]} for ${new Date(y, mo - 1, 1).toLocaleDateString("en-US", { month: "long" })}`;
}

/** "supplies" or "bill:3" → { category, accountId } (null category = not sorted). */
export function parseChoice(v) {
  const s = String(v || "");
  const m = s.match(/^bill:(\d+)$/);
  if (m) return { category: "bill", accountId: Number(m[1]) };
  return { category: BANK_CATEGORIES[s] ? s : null, accountId: null };
}

/**
 * Sort lines: changes = [{ id, value, remember }]. "Remember" saves a rule
 * for that payee (money in or out) and sorts every other unsorted line from
 * them the same way. Returns { changed, remembered, filled }.
 */
export function sortLines(changes, { by = null } = {}) {
  const get = db.prepare("SELECT * FROM bank_txns WHERE id = ?");
  const upd = db.prepare("UPDATE bank_txns SET category = ?, expense_account_id = ?, auto = 0, sorted_by = ?, sorted_at = datetime('now') WHERE id = ?");
  let changed = 0;
  let remembered = 0;
  const filled = [];
  db.transaction(() => {
    for (const c of changes) {
      const t = get.get(Number(c.id));
      if (!t) continue;
      const { category, accountId } = parseChoice(c.value);
      const same = category === t.category && (accountId ?? null) === (t.expense_account_id ?? null);
      if (same && t.auto && category) upd.run(category, accountId, by, t.id); // looked at and kept
      if (!same) {
        upd.run(category, accountId, category ? by : null, t.id);
        changed++;
        if (category === "bill") {
          const f = fillBill({ ...t, expense_account_id: accountId });
          if (f) filled.push(f);
        }
      }
      if (c.remember && category) {
        const match = payeeKey(t.description);
        const dir = t.amount < 0 ? "out" : "in";
        db.prepare(
          `INSERT INTO bank_rules (match, dir, category, expense_account_id, created_by) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (match, dir) DO UPDATE SET category = excluded.category, expense_account_id = excluded.expense_account_id`
        ).run(match, dir, category, accountId, by);
        remembered++;
        const rule = db.prepare("SELECT * FROM bank_rules WHERE match = ? AND dir = ?").get(match, dir);
        for (const o of db.prepare("SELECT * FROM bank_txns WHERE category IS NULL").all()) {
          if (ruleGuess(o, [rule])) {
            db.prepare("UPDATE bank_txns SET category = ?, expense_account_id = ?, auto = 1 WHERE id = ?").run(category, accountId, o.id);
            changed++;
            if (category === "bill") {
              const f = fillBill({ ...o, expense_account_id: accountId });
              if (f) filled.push(f);
            }
          }
        }
      }
    }
  })();
  return { changed, remembered, filled };
}

// ---------------------------------------------------------------------------
// Reading it back
// ---------------------------------------------------------------------------

const LINE_SELECT = `SELECT t.*, b.name AS account_name, a.name AS bill_name, a.category AS bill_category
  FROM bank_txns t JOIN bank_accounts b ON b.id = t.account_id LEFT JOIN expense_accounts a ON a.id = t.expense_account_id`;

/** Lines still to sort, any month, oldest first. */
export function unsortedLines(limit = 300) {
  return db.prepare(`${LINE_SELECT} WHERE t.category IS NULL ORDER BY t.posted, t.id LIMIT ?`).all(limit);
}

export function unsortedCount() {
  return db.prepare("SELECT COUNT(*) AS n FROM bank_txns WHERE category IS NULL").get().n;
}

export function labelOf(t) {
  if (t.category === "bill") return t.bill_name || "A tracked bill";
  return BANK_CATEGORIES[t.category]?.label || "Not sorted";
}

/** A month's lines and what they add up to, by category. */
export function bankMonth(month) {
  const lines = db.prepare(`${LINE_SELECT} WHERE substr(t.posted, 1, 7) = ? ORDER BY t.posted DESC, t.id DESC`).all(month);
  const groups = {};
  for (const t of lines) {
    if (!t.category) continue;
    const key = t.category === "bill" ? `bill:${t.expense_account_id}` : t.category;
    const g = (groups[key] ||= { key, label: labelOf(t), note: t.category === "bill" ? "a tracked bill" : BANK_CATEGORIES[t.category]?.note || "", counts: !!BANK_CATEGORIES[t.category]?.counts, in: 0, out: 0, n: 0 });
    if (t.amount > 0) g.in = round2(g.in + t.amount);
    else g.out = round2(g.out - t.amount);
    g.n++;
  }
  const sum = (f) => round2(lines.filter(f).reduce((s, t) => s + t.amount, 0));
  return {
    lines,
    groups: Object.values(groups).sort((a, b) => b.out + b.in - (a.out + a.in)),
    totalIn: sum((t) => t.amount > 0),
    totalOut: round2(-sum((t) => t.amount < 0)),
    unsorted: lines.filter((t) => !t.category).length,
  };
}

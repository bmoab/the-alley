import { db, getSetting, setSetting } from "./db.js";
import { isSquareConfigured } from "./square.js";
import { fetchStockReceived, fetchNewVariations, describeVariations } from "./square-retail.js";

/**
 * Price tags still to print (server-only), for everything that comes into the
 * shop — counted in from a maker's drop-off on this site, OR added / restocked
 * straight in Square (The Alley's own stock).
 *
 * It's a running tally per item, from the day this started watching:
 *   tags needed = units that came in − tags printed
 * Units in = drop-off sheets received here + stock Square says came in by hand.
 * A brand-new item in Square with no count yet still needs at least one tag,
 * so it shows as "how many?" until something is printed for it.
 *
 * Square is read at most every few minutes (refreshTagWatch) and on the nightly
 * sales sync; working out what's needed (tagsNeeded) is local and cheap.
 */

// Not shelf stock: never needs a tag.
const NOT_SHELF = /rental|event|fee|booking|reservation|sponsor|ticket|deposit|gift ?card/i;
const REFRESH_EVERY_MS = 5 * 60 * 1000;

const toSqlTime = (iso) => String(iso).replace("T", " ").slice(0, 19);

/** When watching started (ISO). Set the first time it's asked, so old stock isn't flagged. */
function watchSince() {
  let since = getSetting("tags_watch_since", "");
  if (!since) {
    since = new Date().toISOString();
    setSetting("tags_watch_since", since);
  }
  return since;
}

let running = null;

/** Pull what's new from Square. Quietly does nothing without Square, or if it ran recently. */
export async function refreshTagWatch({ force = false } = {}) {
  if (!isSquareConfigured()) return { skipped: true };
  const last = getSetting("tags_watch_synced_at", "");
  if (!force && last && Date.now() - Date.parse(last) < REFRESH_EVERY_MS) return { skipped: true };
  if (running) return running;
  running = (async () => {
    const since = watchSince();
    // Re-read a day back from the last pull: a register that was offline
    // uploads its changes late. Repeats are ignored by the primary keys.
    const from = last ? new Date(Math.max(Date.parse(since), Date.parse(last) - 86400 * 1000)).toISOString() : since;
    const now = new Date().toISOString();
    const [stockIn, fresh] = await Promise.all([fetchStockReceived(from), fetchNewVariations(from)]);

    const addIn = db.prepare("INSERT OR IGNORE INTO square_stock_in (id, variation_id, qty, occurred_at) VALUES (?, ?, ?, ?)");
    const seen = db.prepare(
      `INSERT INTO square_variations_seen (variation_id, name, variation_name, category, created_at, is_new)
       VALUES (@variationId, @name, @variationName, @categoryName, @createdAt, @isNew)
       ON CONFLICT(variation_id) DO UPDATE SET name = excluded.name, variation_name = excluded.variation_name,
         category = excluded.category, is_new = MAX(is_new, excluded.is_new)`
    );
    db.transaction(() => {
      for (const c of stockIn) if (c.occurredAt >= since) addIn.run(c.id, c.variationId, c.qty, c.occurredAt);
      for (const v of fresh) seen.run({ ...v, isNew: 1 });
    })();

    // Names for restocked items that weren't new (and aren't a maker's item this site knows).
    const unnamed = db
      .prepare(
        `SELECT DISTINCT s.variation_id FROM square_stock_in s
          WHERE NOT EXISTS (SELECT 1 FROM square_variations_seen v WHERE v.variation_id = s.variation_id)
            AND NOT EXISTS (SELECT 1 FROM inventory_items i WHERE i.square_variation_id = s.variation_id)`
      )
      .all()
      .map((r) => r.variation_id);
    if (unnamed.length) {
      const names = await describeVariations(unnamed);
      db.transaction(() => {
        for (const [variationId, d] of Object.entries(names)) seen.run({ variationId, ...d, createdAt: null, isNew: 0 });
      })();
    }
    setSetting("tags_watch_synced_at", now);
    return { stockIn: stockIn.length, fresh: fresh.length };
  })().finally(() => {
    running = null;
  });
  return running;
}

/**
 * Everything that still needs tags, most recent first:
 * [{ variationId, name, detail, need, unknown, at }]. `need` is the number of
 * tags short; `unknown` means a new item with no count yet (print as many as
 * are on the shelf).
 */
export function tagsNeeded() {
  const since = watchSince();
  const sinceSql = toSqlTime(since);
  const tally = {};
  const row = (id) => (tally[id] ||= { variationId: id, in: 0, printed: 0, at: "", sources: new Set() });

  // Drop-offs counted in on this site.
  for (const l of db
    .prepare(
      `SELECT i.square_variation_id AS vid, l.qty, s.created_at, v.name AS vendor_name
         FROM stock_intake_lines l
         JOIN stock_intakes s ON s.id = l.intake_id
         JOIN inventory_items i ON i.id = l.item_id
         LEFT JOIN vendors v ON v.id = s.vendor_id
        WHERE l.qty > 0 AND i.square_variation_id IS NOT NULL AND s.created_at >= ?`
    )
    .all(sinceSql)) {
    const r = row(l.vid);
    r.in += l.qty;
    r.at = r.at > l.created_at ? r.at : l.created_at;
    r.sources.add(l.vendor_name ? `Drop-off from ${l.vendor_name}` : "Drop-off");
  }
  // Stock received in Square by hand. Skip anything at the same moment as a
  // drop-off sheet for that item — that's this site's own push to Square.
  const sheetTimes = {};
  for (const l of db
    .prepare(
      `SELECT i.square_variation_id AS vid, s.created_at FROM stock_intake_lines l
         JOIN stock_intakes s ON s.id = l.intake_id JOIN inventory_items i ON i.id = l.item_id
        WHERE i.square_variation_id IS NOT NULL AND s.created_at >= ?`
    )
    .all(sinceSql)) {
    (sheetTimes[l.vid] ||= []).push(Date.parse(l.created_at.replace(" ", "T") + "Z"));
  }
  for (const s of db.prepare("SELECT variation_id, qty, occurred_at FROM square_stock_in WHERE occurred_at >= ?").all(since)) {
    const t = Date.parse(s.occurred_at);
    if ((sheetTimes[s.variation_id] || []).some((x) => Math.abs(x - t) < 5000)) continue;
    const r = row(s.variation_id);
    r.in += s.qty;
    const at = toSqlTime(s.occurred_at);
    r.at = r.at > at ? r.at : at;
    r.sources.add("Stock added in Square");
  }
  // New items in Square — at least one tag, even before anyone enters a count.
  const seen = Object.fromEntries(db.prepare("SELECT * FROM square_variations_seen").all().map((v) => [v.variation_id, v]));
  for (const v of Object.values(seen)) {
    if (!v.is_new || NOT_SHELF.test(`${v.category} ${v.name}`)) continue;
    const r = row(v.variation_id);
    r.isNew = true;
    const at = v.created_at ? toSqlTime(v.created_at) : "";
    r.at = r.at > at ? r.at : at;
    r.sources.add("New in Square");
  }
  // Tags printed since watching started.
  for (const p of db.prepare("SELECT items_json FROM tag_prints WHERE created_at >= ?").all(sinceSql)) {
    for (const i of JSON.parse(p.items_json)) if (tally[i.variationId]) tally[i.variationId].printed += Number(i.qty) || 0;
  }

  const local = Object.fromEntries(
    db
      .prepare(
        `SELECT i.square_variation_id AS vid, i.name, v.name AS vendor_name
           FROM inventory_items i LEFT JOIN vendors v ON v.id = i.vendor_id WHERE i.square_variation_id IS NOT NULL`
      )
      .all()
      .map((i) => [i.vid, i])
  );
  // Event tickets this site sells through Square are never on a shelf.
  const tickets = new Set(
    db.prepare("SELECT square_ticket_variation_id AS vid FROM events WHERE square_ticket_variation_id IS NOT NULL").all().map((e) => e.vid)
  );
  const out = [];
  for (const r of Object.values(tally)) {
    if (tickets.has(r.variationId)) continue;
    const s = seen[r.variationId];
    const l = local[r.variationId];
    if (!l && s && NOT_SHELF.test(`${s.category} ${s.name}`)) continue;
    const unknown = r.isNew && r.in === 0 && r.printed === 0;
    const need = Math.max(0, r.in - r.printed);
    if (!need && !unknown) continue;
    out.push({
      variationId: r.variationId,
      name: l?.name || [s?.name, s?.variation_name].filter(Boolean).join(" · ") || "An item in Square",
      detail: [...r.sources].join(" · "),
      need,
      unknown,
      at: r.at,
    });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

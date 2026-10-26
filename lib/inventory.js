import { createHash } from "node:crypto";
import { customAlphabet } from "nanoid";
import { db, getSetting, setSetting } from "./db.js";
import { venueNow, shiftDate } from "./constants.js";
import {
  makerCategory,
  createCatalogItem,
  updateVariationPrice,
  addStock,
  removeStock,
  adjustStock,
  fetchCounts,
  fetchCompletedOrders,
  fetchRefunds,
  listCatalog,
  listMakerCategories,
  pickMakerCategory,
  realId,
  setSkus,
  fromMoney,
} from "./square-retail.js";
import { isSquareConfigured } from "./square.js";
import { refreshTagWatch } from "./tag-watch.js";

/**
 * Retail inventory, consignment and register sales (server-only).
 *
 * Makers' (consigned) stock: listed by the maker as a drop-off, counted in and
 * RECEIVED here → pushed to Square as catalog items + stock → sold at the
 * Square register → pulled back nightly (lib/square-retail.js
 * fetchCompletedOrders) into retail_sales, where maker payouts and the
 * sales-tax numbers come from.
 *
 * Things The Alley buys outright are added straight in Square and never pass
 * through here; the sync counts any sale of an item this site didn't make as
 * The Alley's own. Price tags and shelf counts cover the whole Square catalog.
 */

const portalToken = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789", 24);

/**
 * Round to cents, halves AWAY from zero — so a return takes back exactly the
 * share its sale paid (plain Math.round sends −8.645 to −8.64, but 8.645 to 8.65).
 */
export const round2 = (n) => {
  const x = Number(n) || 0;
  return (Math.sign(x) * Math.round((Math.abs(x) + Number.EPSILON) * 100)) / 100 || 0;
};

function cleanText(v) {
  const s = String(v ?? "").trim();
  return s || null;
}

function cleanMoney(v, label) {
  const s = String(v ?? "").trim().replace(/[$,]/g, "");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be a dollar amount.`);
  return round2(n);
}

function cleanPercent(v) {
  const s = String(v ?? "").trim().replace("%", "");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error("A consignment split is a percentage from 0 to 100.");
  return n;
}

export function defaultSplit() {
  const n = Number(getSetting("consignment_default_split", "60"));
  return Number.isFinite(n) ? n : 60;
}

// ---------------------------------------------------------------------------
// Vendors
// ---------------------------------------------------------------------------

export function listVendors({ includeInactive = false } = {}) {
  return db
    .prepare(
      `SELECT v.*,
              (SELECT COUNT(*) FROM inventory_items i WHERE i.vendor_id = v.id AND i.status = 'active') AS item_count,
              (SELECT COALESCE(SUM(i.qty_on_hand), 0) FROM inventory_items i WHERE i.vendor_id = v.id AND i.status = 'active') AS on_hand
         FROM vendors v
        ${includeInactive ? "" : "WHERE v.is_active = 1"}
        ORDER BY v.is_active DESC, v.name COLLATE NOCASE`
    )
    .all();
}

export function getVendor(id) {
  return db.prepare("SELECT * FROM vendors WHERE id = ?").get(id);
}

export function getVendorByToken(token) {
  if (!token) return null;
  return db.prepare("SELECT * FROM vendors WHERE portal_token = ? AND is_active = 1").get(token) || null;
}

export function createVendor(fields) {
  const name = cleanText(fields.name);
  if (!name) throw new Error("The maker needs a name.");
  const kind = "consignor";
  const info = db
    .prepare(
      `INSERT INTO vendors (name, kind, contact_name, email, phone, default_split, payout_method, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      name,
      kind,
      cleanText(fields.contact_name),
      cleanText(fields.email)?.toLowerCase() ?? null,
      cleanText(fields.phone),
      kind === "consignor" ? cleanPercent(fields.default_split) : null,
      cleanText(fields.payout_method),
      cleanText(fields.notes)
    );
  return getVendor(info.lastInsertRowid);
}

export function updateVendor(id, fields) {
  const v = getVendor(id);
  if (!v) throw new Error("That vendor no longer exists.");
  const kind = v.kind;
  db.prepare(
    `UPDATE vendors SET name = ?, kind = ?, contact_name = ?, email = ?, phone = ?, default_split = ?,
            payout_method = ?, notes = ? WHERE id = ?`
  ).run(
    cleanText(fields.name) || v.name,
    kind,
    fields.contact_name === undefined ? v.contact_name : cleanText(fields.contact_name),
    fields.email === undefined ? v.email : cleanText(fields.email)?.toLowerCase() ?? null,
    fields.phone === undefined ? v.phone : cleanText(fields.phone),
    fields.default_split === undefined ? v.default_split : kind === "consignor" ? cleanPercent(fields.default_split) : null,
    fields.payout_method === undefined ? v.payout_method : cleanText(fields.payout_method),
    fields.notes === undefined ? v.notes : cleanText(fields.notes),
    id
  );
  return getVendor(id);
}

/** The maker's category in Square, picked on their page (null = match by name). */
export function setVendorCategory(id, categoryId) {
  db.prepare("UPDATE vendors SET square_category_id = ? WHERE id = ?").run(categoryId || null, id);
}

/**
 * A maker's items that were typed straight into Square (before drop-offs came
 * through here), so this site doesn't know they're theirs: everything in their
 * Square category that isn't one of ours yet. Returns { category, rows } —
 * category is null when they have none in Square. Pass the maker categories if
 * they're already to hand, to save a trip to Square.
 */
export async function unlinkedSquareItems(vendor, makerCategories = null) {
  if (!isSquareConfigured() || !vendor) return { category: null, rows: [] };
  const cats = makerCategories || (await listMakerCategories());
  const category = pickMakerCategory(cats, vendor.name, realId(vendor.square_category_id));
  if (!category) return { category: null, rows: [] };
  const known = new Set(
    db.prepare("SELECT square_variation_id FROM inventory_items WHERE square_variation_id IS NOT NULL").all().map((r) => r.square_variation_id)
  );
  const rows = (await listCatalog()).filter((r) => r.categoryIds.includes(category.id) && !known.has(r.variationId));
  return { category, rows };
}

/**
 * Make those items this maker's here, so their sales count toward what they're
 * owed — from now on only: sales before linking were settled the old way, so
 * saveSaleLines leaves them out. `variationIds` = the ones on screen when the
 * button was pressed, so nothing added since slips in unseen. Returns how many.
 */
export async function linkSquareItems(vendorId, variationIds) {
  const vendor = getVendor(vendorId);
  if (!vendor) throw new Error("That maker no longer exists.");
  const { rows } = await unlinkedSquareItems(vendor);
  const pick = rows.filter((r) => variationIds.includes(r.variationId));
  if (!pick.length) return 0;
  const { counts } = await fetchCounts(pick.filter((r) => r.tracked).map((r) => r.variationId));
  const now = venueNow();
  const skuTaken = db.prepare("SELECT 1 FROM inventory_items WHERE sku = ?");
  const insert = db.prepare(
    `INSERT INTO inventory_items
       (vendor_id, name, sku, ownership, price, qty_on_hand, square_item_id, square_variation_id, notes, linked_at, synced_at)
     VALUES (?, ?, ?, 'consignment', ?, ?, ?, ?, 'Linked from Square', ?, datetime('now'))`
  );
  db.transaction(() => {
    for (const r of pick) {
      insert.run(
        vendor.id,
        [r.name, r.variationName].filter(Boolean).join(" — "),
        r.sku && !skuTaken.get(r.sku) ? r.sku : null,
        r.price ?? 0,
        counts[r.variationId] ?? 0,
        r.itemId,
        r.variationId,
        now
      );
    }
  })();
  return pick.length;
}

/**
 * The gallery artist a maker record belongs to — linked by hand, or the same
 * email (the rule makerForExhibitor uses the other way round) — or null. An
 * artist whose work we sell is a maker underneath: same drop-offs, tags,
 * register, sales and payouts.
 */
export function artistForVendor(vendorOrId) {
  const v = typeof vendorOrId === "object" ? vendorOrId : getVendor(vendorOrId);
  if (!v) return null;
  const email = String(v.email || "").trim().toLowerCase();
  return (
    db
      .prepare(
        `SELECT * FROM exhibitors
          WHERE vendor_id = ? OR (vendor_id IS NULL AND ? <> '' AND lower(trim(contact_email)) = ?)
          ORDER BY vendor_id IS NULL, id LIMIT 1`
      )
      .get(v.id, email, email) || null
  );
}

/** Start selling a gallery artist's work: a maker record in their name, linked to their listing. */
export function startSellingArtist(exhibitorId) {
  const ex = db.prepare("SELECT * FROM exhibitors WHERE id = ?").get(exhibitorId);
  if (!ex) throw new Error("That artist is gone — reload the page.");
  if (ex.vendor_id && getVendor(ex.vendor_id)) return getVendor(ex.vendor_id);
  const email = String(ex.contact_email || "").trim().toLowerCase();
  // Someone with their email may already sell in the shop: that's them.
  const existing = email ? db.prepare("SELECT * FROM vendors WHERE lower(trim(email)) = ? AND is_active = 1").get(email) : null;
  const vendor = existing || createVendor({ name: ex.name, contact_name: ex.name, email });
  db.prepare("UPDATE exhibitors SET vendor_id = ? WHERE id = ?").run(vendor.id, ex.id);
  ensureVendorToken(vendor.id);
  return getVendor(vendor.id);
}

export function setVendorActive(id, active) {
  db.prepare("UPDATE vendors SET is_active = ? WHERE id = ?").run(active ? 1 : 0, id);
}

export function ensureVendorToken(id) {
  const v = getVendor(id);
  if (!v) return null;
  if (v.portal_token) return v.portal_token;
  db.prepare("UPDATE vendors SET portal_token = ? WHERE id = ? AND portal_token IS NULL").run(portalToken(), id);
  return getVendor(id).portal_token;
}

/** Replace a maker's private link; the old one stops working at once. */
export function rotateVendorToken(id) {
  db.prepare("UPDATE vendors SET portal_token = ? WHERE id = ?").run(portalToken(), id);
  return getVendor(id)?.portal_token || null;
}

/** A consigned item's split: its own, else its vendor's, else the shop default. */
export function splitFor(item, vendor) {
  if (item?.split != null) return Number(item.split);
  if (vendor?.default_split != null) return Number(vendor.default_split);
  return defaultSplit();
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

const ITEM_SELECT = `
  SELECT i.*, v.name AS vendor_name, v.kind AS vendor_kind, v.default_split AS vendor_split
    FROM inventory_items i
    LEFT JOIN vendors v ON v.id = i.vendor_id`;

export function listItems({ vendorId, status = "active", q } = {}) {
  const where = [];
  const params = [];
  if (vendorId) {
    where.push("i.vendor_id = ?");
    params.push(vendorId);
  }
  if (status && status !== "all") {
    where.push("i.status = ?");
    params.push(status);
  }
  if (q && q.trim()) {
    where.push("(i.name LIKE ? OR i.sku LIKE ? OR v.name LIKE ?)");
    const like = `%${q.trim()}%`;
    params.push(like, like, like);
  }
  return db
    .prepare(`${ITEM_SELECT}${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY v.name COLLATE NOCASE, i.name COLLATE NOCASE`)
    .all(...params);
}

export function getItem(id) {
  return db.prepare(`${ITEM_SELECT} WHERE i.id = ?`).get(id);
}

/**
 * The number on a maker item's price tag and in its barcode: "21" + the item's
 * id, 8 digits in all. Digits only, because a scanner types the barcode into
 * Square like a keyboard and some drop letters or symbols; an even length
 * packs into the shortest Code 128. Items made straight in Square get "22…"
 * (giveBarcodes), so the two can never collide.
 */
function skuFor(id) {
  return `21${String(id).padStart(6, "0")}`;
}

export function updateItem(id, fields) {
  const item = getItem(id);
  if (!item) throw new Error("That item no longer exists.");
  db.prepare("UPDATE inventory_items SET name = ?, split = ?, unit_cost = ?, notes = ? WHERE id = ?").run(
    cleanText(fields.name) || item.name,
    item.ownership === "consignment" ? cleanPercent(fields.split) : null,
    item.ownership === "owned" ? cleanMoney(fields.unit_cost, "Cost") : null,
    cleanText(fields.notes),
    id
  );
  return getItem(id);
}

// ---------------------------------------------------------------------------
// Groups and the maker's own costs (both optional, website-only)
// ---------------------------------------------------------------------------

const GROUP_MAX = 60;

// Exactly what lib/uploads.js saveUpload returns.
const UPLOAD_PATH = /^\/uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,5}$/i;

/** An item's photo (optional): one of our uploads, or nothing. */
function cleanPhoto(v) {
  const s = cleanText(v);
  if (!s) return null;
  if (!UPLOAD_PATH.test(s)) throw new Error("A photo didn't upload properly — add it again.");
  return s;
}

function cleanGroup(v) {
  const s = cleanText(v)?.replace(/\s+/g, " ");
  if (s && s.length > GROUP_MAX) throw new Error(`Keep a group name under ${GROUP_MAX} characters.`);
  return s;
}

// "Large Candle- Palo Santo", "Large Candle - Palo Santo", "Large Candle: Palo Santo"…
const NAME_SPLIT = /^(.{2,60}?)\s*(?:\s[-–—]\s|[-–—:]\s)\s*(.+)$/;

/** The group a name suggests ("Large Candle- Palo Santo" → "Large Candle"), or null. */
export function groupFromName(name) {
  const m = String(name || "").trim().match(NAME_SPLIT);
  return m ? m[1].trim() : null;
}

/** An item's name inside its group: "Palo Santo" for "Large Candle- Palo Santo" in "Large Candle". */
export function shortName(name, group) {
  const n = String(name || "");
  if (!group) return n;
  const m = n.match(NAME_SPLIT);
  return m && m[1].trim().toLowerCase() === group.toLowerCase() ? m[2].trim() : n;
}

/** A maker's groups, each with the price its newest item sells at (to fill in a drop-off). */
export function makerGroups(vendorId) {
  return db
    .prepare(
      `SELECT item_group AS name, price FROM inventory_items i
        WHERE vendor_id = ? AND item_group IS NOT NULL
          AND id = (SELECT MAX(id) FROM inventory_items j WHERE j.vendor_id = i.vendor_id AND j.item_group = i.item_group)
        ORDER BY item_group COLLATE NOCASE`
    )
    .all(vendorId);
}

/**
 * Save groups, photos and (when `withCost`) the maker's costs for their items:
 * rows = [{ id, group, photo, cost }]. Only the maker's own items are touched;
 * staff never send costs, so a maker's private costs are never overwritten from
 * the admin. A row without `photo` keeps the one it has.
 */
export function saveItemSetup(vendorId, rows, { withCost = false } = {}) {
  const mine = new Set(db.prepare("SELECT id FROM inventory_items WHERE vendor_id = ?").all(vendorId).map((r) => r.id));
  const clean = (Array.isArray(rows) ? rows : [])
    .filter((r) => mine.has(Number(r.id)))
    .map((r) => ({
      id: Number(r.id),
      group: cleanGroup(r.group),
      photo: r.photo === undefined ? undefined : cleanPhoto(r.photo),
      cost: withCost ? cleanMoney(r.cost, "Your cost") : undefined,
    }));
  const setGroup = db.prepare("UPDATE inventory_items SET item_group = ? WHERE id = ?");
  const setPhoto = db.prepare("UPDATE inventory_items SET photo = ? WHERE id = ?");
  const setCost = db.prepare("UPDATE inventory_items SET maker_cost = ? WHERE id = ?");
  db.transaction(() => {
    for (const r of clean) {
      setGroup.run(r.group, r.id);
      if (r.photo !== undefined) setPhoto.run(r.photo, r.id);
      if (withCost) setCost.run(r.cost, r.id);
    }
  })();
  return clean.length;
}

/**
 * Sort a maker's ungrouped items by the first part of their names, wherever
 * two or more share one ("Large Candle- Palo Santo", "Large Candle- Limoncello"
 * → "Large Candle"). Returns how many items it grouped.
 */
export function groupByName(vendorId) {
  const items = db.prepare("SELECT id, name FROM inventory_items WHERE vendor_id = ? AND item_group IS NULL").all(vendorId);
  const byGroup = {};
  for (const i of items) {
    const g = groupFromName(i.name);
    if (g) (byGroup[g.toLowerCase()] ||= { name: g, ids: [] }).ids.push(i.id);
  }
  const set = db.prepare("UPDATE inventory_items SET item_group = ? WHERE id = ?");
  let n = 0;
  db.transaction(() => {
    for (const g of Object.values(byGroup)) {
      if (g.ids.length < 2) continue;
      for (const id of g.ids) n += set.run(g.name, id).changes;
    }
  })();
  return n;
}

/** The groups groupByName would make right now: [{ name, count }]. */
export function suggestedGroups(vendorId) {
  const items = db.prepare("SELECT name FROM inventory_items WHERE vendor_id = ? AND item_group IS NULL").all(vendorId);
  const byGroup = {};
  for (const i of items) {
    const g = groupFromName(i.name);
    if (g) (byGroup[g.toLowerCase()] ||= { name: g, count: 0 }).count++;
  }
  return Object.values(byGroup).filter((g) => g.count >= 2);
}

// ---------------------------------------------------------------------------
// Receiving stock
// ---------------------------------------------------------------------------

/**
 * Record a delivery — the paper sheet, digitally. `lines` are
 * { itemId } for more of something already stocked, or { name } for something
 * new, each with qty, price and (optionally) its own split.
 * Saved locally first, in one transaction, so nothing is lost if Square is
 * unreachable; then pushed to Square (pushIntakeToSquare), which can be retried.
 */
export function recordIntake({ vendorId, receivedOn, receivedBy, signedName, notes, lines, dropoffId = null }) {
  const vendor = getVendor(vendorId);
  if (!vendor) throw new Error("Pick who it's from.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(receivedOn || ""))) throw new Error("Pick the date it came in.");
  const clean = (lines || [])
    .map((l) => ({ ...l, qty: Number.parseInt(l.qty, 10) }))
    .filter((l) => (l.itemId || cleanText(l.name)) && l.qty);
  if (!clean.length) throw new Error("Add at least one item with a quantity.");
  for (const l of clean) {
    if (!Number.isInteger(l.qty) || l.qty <= 0 || l.qty > 10000) throw new Error("Quantities are whole numbers above zero.");
  }
  const ownership = "consignment";
  const groupCost = db.prepare(
    `SELECT maker_cost FROM inventory_items WHERE vendor_id = ? AND item_group = ? AND maker_cost IS NOT NULL
      ORDER BY id DESC LIMIT 1`
  );

  const tx = db.transaction(() => {
    const intakeId = db
      .prepare(
        "INSERT INTO stock_intakes (vendor_id, received_on, received_by, signed_name, notes) VALUES (?, ?, ?, ?, ?)"
      )
      .run(vendor.id, receivedOn, receivedBy, cleanText(signedName), cleanText(notes)).lastInsertRowid;

    // Claim the drop-off in the same transaction, so two people counting the
    // same box in at once can't both add its stock.
    if (dropoffId) {
      const claimed = db
        .prepare(
          `UPDATE dropoffs SET status = 'accepted', intake_id = ?, decided_by = ?, decided_at = datetime('now')
            WHERE id = ? AND vendor_id = ? AND status = 'submitted'`
        )
        .run(intakeId, receivedBy, dropoffId, vendor.id);
      if (!claimed.changes) throw new Error("That drop-off has already been counted in (or was cancelled).");
    }

    for (const l of clean) {
      let item = l.itemId ? getItem(Number(l.itemId)) : null;
      if (l.itemId && (!item || item.vendor_id !== vendor.id)) throw new Error("One of those items belongs to someone else.");
      const price = cleanMoney(l.price, "Price") ?? item?.price;
      if (price == null || price <= 0) throw new Error(`Give "${l.name || item?.name}" a price.`);
      const unitCost = ownership === "owned" ? cleanMoney(l.unit_cost, "Cost") ?? item?.unit_cost ?? null : null;
      const split = ownership === "consignment" ? cleanPercent(l.split) ?? item?.split ?? null : null;

      const priceChanged = item && Number(item.price) !== price ? 1 : 0;
      if (!item) {
        // A new scent in a group they already cost out costs them the same.
        const group = cleanGroup(l.group);
        const makerCost = group ? groupCost.get(vendor.id, group)?.maker_cost ?? null : null;
        const id = db
          .prepare(
            `INSERT INTO inventory_items (vendor_id, name, ownership, unit_cost, price, split, item_group, maker_cost, photo)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(vendor.id, cleanText(l.name), ownership, unitCost, price, split, group, makerCost, cleanPhoto(l.photo)).lastInsertRowid;
        db.prepare("UPDATE inventory_items SET sku = ? WHERE id = ?").run(skuFor(id), id);
        item = getItem(id);
      }
      db.prepare(
        `UPDATE inventory_items
            SET qty_received = qty_received + ?, qty_on_hand = qty_on_hand + ?, price = ?,
                unit_cost = COALESCE(?, unit_cost), split = COALESCE(?, split), status = 'active'
          WHERE id = ?`
      ).run(l.qty, l.qty, price, unitCost, split, item.id);
      db.prepare(
        "INSERT INTO stock_intake_lines (intake_id, item_id, qty, price, unit_cost, split, price_changed) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).run(intakeId, item.id, l.qty, price, unitCost, split, priceChanged);
    }
    return intakeId;
  });
  return tx();
}

export function getIntake(id) {
  const intake = db
    .prepare(
      `SELECT s.*, v.name AS vendor_name, v.kind AS vendor_kind, v.default_split AS vendor_split
         FROM stock_intakes s LEFT JOIN vendors v ON v.id = s.vendor_id WHERE s.id = ?`
    )
    .get(id);
  if (!intake) return null;
  const lines = db
    .prepare(
      `SELECT l.*, i.name, i.sku, i.square_variation_id, i.square_item_id, i.price AS current_price, i.ownership
         FROM stock_intake_lines l JOIN inventory_items i ON i.id = l.item_id
        WHERE l.intake_id = ? ORDER BY l.id`
    )
    .all(id);
  return { ...intake, lines };
}

export function listIntakes({ vendorId, limit = 50 } = {}) {
  return db
    .prepare(
      `SELECT s.*, v.name AS vendor_name,
              (SELECT COALESCE(SUM(qty), 0) FROM stock_intake_lines l WHERE l.intake_id = s.id) AS units,
              (SELECT COUNT(*) FROM stock_intake_lines l WHERE l.intake_id = s.id) AS line_count
         FROM stock_intakes s LEFT JOIN vendors v ON v.id = s.vendor_id
        ${vendorId ? "WHERE s.vendor_id = ?" : ""}
        ORDER BY s.received_on DESC, s.id DESC LIMIT ?`
    )
    .all(...(vendorId ? [vendorId, limit] : [limit]));
}

/**
 * Put an intake into Square: the maker's category (found, or made inside
 * Alley Gallery Consignment), a catalog item for
 * anything new, the current price on anything re-stocked, then the stock
 * itself in one batch keyed to the intake (so a retry can't double-count).
 * Records the outcome on the intake; never throws.
 */
export async function pushIntakeToSquare(intakeId) {
  const intake = getIntake(intakeId);
  if (!intake || intake.square_status === "synced") return { ok: true };
  // One push at a time per sheet (a double-click on "Try again", two tabs).
  // A push that died part-way is free to go again after a few minutes.
  const claimed = db
    .prepare(
      `UPDATE stock_intakes SET square_status = 'pushing', square_push_started_at = datetime('now')
        WHERE id = ? AND (square_status IN ('pending', 'failed')
              OR (square_status = 'pushing' AND square_push_started_at < datetime('now', '-5 minutes')))`
    )
    .run(intake.id);
  if (!claimed.changes) return { ok: false, error: "Already being sent to Square — give it a minute." };
  // The sheet's own time, so a retry sends Square exactly the same request.
  const occurredAt = new Date(`${intake.created_at.replace(" ", "T")}Z`).toISOString();
  try {
    const returning = intake.lines.every((l) => l.qty < 0);
    const changes = [];
    if (returning) {
      for (const line of intake.lines) {
        const variationId = realId(line.square_variation_id);
        if (variationId) changes.push({ variationId, qty: -line.qty });
      }
      for (const c of changes) {
        await removeStock(c.variationId, c.qty, { idempotencyKey: `alley-intake-${intake.id}-${c.variationId}`, occurredAt });
      }
    } else {
      const vendor = getVendor(intake.vendor_id);
      const categoryId = await makerCategory(vendor.name, realId(vendor.square_category_id), vendor.id);
      if (categoryId !== vendor.square_category_id) {
        db.prepare("UPDATE vendors SET square_category_id = ? WHERE id = ?").run(categoryId, vendor.id);
      }
      for (const line of intake.lines) {
        let variationId = realId(line.square_variation_id);
        if (!variationId) {
          const created = await createCatalogItem({
            name: line.name,
            sku: line.sku,
            price: line.price,
            categoryId,
            idempotencyKey: `alley-item-${line.item_id}`,
          });
          db.prepare("UPDATE inventory_items SET square_item_id = ?, square_variation_id = ? WHERE id = ?").run(
            created.itemId,
            created.variationId,
            line.item_id
          );
          variationId = created.variationId;
        } else if (line.price_changed) {
          await updateVariationPrice(variationId, line.price);
        }
        changes.push({ variationId, qty: line.qty });
      }
      // Merge repeats of the same item on one sheet into one change.
      const merged = Object.values(
        changes.reduce((acc, c) => {
          acc[c.variationId] = { variationId: c.variationId, qty: (acc[c.variationId]?.qty || 0) + c.qty };
          return acc;
        }, {})
      );
      await addStock(merged, { idempotencyKey: `alley-intake-${intake.id}`, occurredAt });
    }
    // Simulated (no Square connected): stays pending, so it really goes to
    // Square — with real ids — once Square is connected.
    db.prepare("UPDATE stock_intakes SET square_status = ?, square_error = NULL WHERE id = ?").run(
      isSquareConfigured() ? "synced" : "pending",
      intake.id
    );
    return { ok: true };
  } catch (err) {
    console.error("[inventory] Square push failed", err);
    db.prepare("UPDATE stock_intakes SET square_status = 'failed', square_error = ? WHERE id = ?").run(
      String(err.message || err).slice(0, 500),
      intake.id
    );
    return { ok: false, error: err.message };
  }
}

/**
 * Stock handed back to its maker (or written off): recorded as a negative
 * line on its own sheet, and Square's count is set to what's left.
 */
export async function returnStock({ itemId, qty, by, reason }) {
  let item = getItem(itemId);
  if (!item) throw new Error("That item no longer exists.");
  const n = Number.parseInt(qty, 10);
  if (!Number.isInteger(n) || n <= 0) throw new Error("How many are going back?");
  // Check against Square's live count first — things may have sold since the last sync.
  if (item.square_variation_id) {
    const { counts } = await fetchCounts([item.square_variation_id]);
    const live = counts[item.square_variation_id];
    if (live != null && live !== item.qty_on_hand) {
      db.prepare("UPDATE inventory_items SET qty_on_hand = ?, synced_at = datetime('now') WHERE id = ?").run(live, item.id);
      item = getItem(itemId);
    }
  }
  if (n > item.qty_on_hand) throw new Error(`Only ${item.qty_on_hand} on hand.`);
  const left = item.qty_on_hand - n;
  const intakeId = db.transaction(() => {
    const intakeId = db
      .prepare("INSERT INTO stock_intakes (vendor_id, received_on, received_by, notes) VALUES (?, ?, ?, ?)")
      .run(item.vendor_id, venueNow().slice(0, 10), by, `Returned: ${cleanText(reason) || "back to the maker"}`).lastInsertRowid;
    db.prepare(
      "INSERT INTO stock_intake_lines (intake_id, item_id, qty, price, unit_cost, split) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(intakeId, item.id, -n, item.price, item.unit_cost, item.split);
    db.prepare("UPDATE inventory_items SET qty_on_hand = ?, status = CASE WHEN ? = 0 THEN 'returned' ELSE status END WHERE id = ?").run(
      left,
      left,
      item.id
    );
    return intakeId;
  })();
  // Its own sheet, pushed like any other — so a failure shows on the sheet
  // with a "Try again" instead of leaving Square still selling it.
  const push = await pushIntakeToSquare(intakeId);
  return { left, intakeId, pushed: push.ok };
}

// ---------------------------------------------------------------------------
// Sales sync
// ---------------------------------------------------------------------------

/** Invoices this site raises (bookings, staff-cost shares) land in the same Square location — keep them apart. */
function classify(name, itemType) {
  // A gift card sold isn't a sale of anything yet — it's taxed when it's spent.
  if (itemType === "GIFT_CARD") return "giftcard";
  const n = String(name || "");
  if (/^Space rental/i.test(n)) return "rental";
  if (/^Refundable cleaning deposit/i.test(n)) return "deposit";
  // Tenants paying their share of staff cost (lib/staff-costs.js) — not a sale.
  if (/^Shared staff cost/i.test(n)) return "staffshare";
  // A co-payer's share of the building's bills (Money page) — not a sale.
  if (/^Utility share/i.test(n)) return "utilityshare";
  // Rent invoiced through Square — income, but not a shop sale or taxable.
  if (/\brent\b/i.test(n)) return "rent";
  return "retail";
}

function variationIndex() {
  const rows = db.prepare("SELECT id, square_variation_id FROM inventory_items WHERE square_variation_id IS NOT NULL").all();
  return Object.fromEntries(rows.map((r) => [r.square_variation_id, r.id]));
}

/** Square variation id → event id, for The Alley's own ticket items. */
function ticketIndex() {
  const rows = db.prepare("SELECT id, square_ticket_variation_id FROM events WHERE square_ticket_variation_id IS NOT NULL").all();
  return Object.fromEntries(rows.map((r) => [r.square_ticket_variation_id, r.id]));
}

/** Turn Square orders into retail_sales rows (pure apart from the item lookups). */
export function linesFromOrders(orders, itemByVariation = variationIndex(), eventByTicket = ticketIndex()) {
  const kindOf = (li) => (eventByTicket[li.catalog_object_id] ? "ticket" : classify(li.name, li.item_type));
  // What the line sold for: after discounts, before tax — and without its share
  // of any service charge, which isn't the maker's sale.
  const netOf = (li) => fromMoney(li.total_money) - fromMoney(li.total_tax_money) - fromMoney(li.total_service_charge_money);
  const out = [];
  for (const o of orders) {
    const soldAt = venueNow(new Date(o.closed_at || o.updated_at || o.created_at));
    for (const li of o.line_items || []) {
      const net = netOf(li);
      out.push({
        square_order_id: o.id,
        line_uid: li.uid || `${o.id}-${out.length}`,
        is_return: 0,
        sold_at: soldAt,
        kind: kindOf(li),
        item_id: itemByVariation[li.catalog_object_id] ?? null,
        catalog_object_id: li.catalog_object_id || null,
        name: [li.name, li.variation_name && li.variation_name !== "Regular" ? li.variation_name : null].filter(Boolean).join(" — ") || "Custom amount",
        qty: Number(li.quantity) || 0,
        gross: round2(fromMoney(li.gross_sales_money)),
        discount: round2(fromMoney(li.total_discount_money)),
        net: round2(net),
        tax: round2(fromMoney(li.total_tax_money)),
        total: round2(fromMoney(li.total_money)),
      });
    }
    for (const r of o.returns || []) {
      for (const li of r.return_line_items || []) {
        const net = netOf(li);
        out.push({
          square_order_id: o.id,
          line_uid: li.uid || `${o.id}-r${out.length}`,
          is_return: 1,
          sold_at: soldAt,
          kind: kindOf(li),
          item_id: itemByVariation[li.catalog_object_id] ?? null,
          catalog_object_id: li.catalog_object_id || null,
          name: li.name || "Return",
          qty: -(Number(li.quantity) || 0),
          gross: -round2(fromMoney(li.gross_return_money)),
          discount: -round2(fromMoney(li.total_discount_money)),
          net: -round2(net),
          tax: -round2(fromMoney(li.total_tax_money)),
          total: -round2(fromMoney(li.total_money)),
        });
      }
    }
  }
  return out;
}

export function saveSaleLines(lines) {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO retail_sales
       (square_order_id, line_uid, is_return, sold_at, kind, item_id, catalog_object_id, name, qty, gross, discount, net, tax, total, split)
     VALUES (@square_order_id, @line_uid, @is_return, @sold_at, @kind, @item_id, @catalog_object_id, @name, @qty, @gross, @discount, @net, @tax, @total, @split)`
  );
  const itemSplit = db.prepare(
    `SELECT i.ownership, i.split AS item_split, v.default_split AS vendor_split, i.linked_at
       FROM inventory_items i LEFT JOIN vendors v ON v.id = i.vendor_id WHERE i.id = ?`
  );
  // A return gives back at the split its sale was paid at, not today's.
  const soldAtSplit = db.prepare(
    `SELECT split FROM retail_sales WHERE item_id = ? AND is_return = 0 AND split IS NOT NULL AND sold_at <= ?
      ORDER BY sold_at DESC LIMIT 1`
  );
  let added = 0;
  db.transaction(() => {
    for (let l of lines) {
      let split = null;
      let item = l.item_id ? itemSplit.get(l.item_id) : null;
      // Linked from Square later: a sale from before then (or a return of one)
      // was settled the old way, so it isn't the maker's here.
      if (item?.linked_at && (l.sold_at < item.linked_at || (l.is_return && !soldAtSplit.get(l.item_id, l.sold_at)))) {
        item = null;
        l = { ...l, item_id: null };
      }
      if (item?.ownership === "consignment") {
        split = (l.is_return ? soldAtSplit.get(l.item_id, l.sold_at)?.split : null) ?? splitOf(item);
      }
      added += insert.run({ ...l, split }).changes;
    }
  })();
  return added;
}

/**
 * Keep every completed Square refund. One given back item by item also shows
 * up as returned lines (and is handled there); one given back as an AMOUNT
 * doesn't, so the Sales page lists those for someone to sort out by hand.
 */
export function saveRefunds(refunds) {
  const insert = db.prepare(
    `INSERT INTO square_refunds (id, payment_id, order_id, amount, status, reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET status = excluded.status, amount = excluded.amount`
  );
  db.transaction(() => {
    for (const r of refunds || []) {
      insert.run(
        r.id,
        r.payment_id || null,
        r.order_id || null,
        round2(fromMoney(r.amount_money)),
        r.status || "",
        r.reason || null,
        venueNow(new Date(r.created_at))
      );
    }
  })();
}

/**
 * Refunds in a range that no returned line accounts for — given back as an
 * amount, so neither the tax figures nor a maker's share know about them.
 * Each comes with what was on the order it refunded, when we have it.
 */
export function unmatchedRefunds(from, to) {
  const rows = db
    .prepare(
      `SELECT r.* FROM square_refunds r
        WHERE r.status = 'COMPLETED' AND r.created_at >= ? AND r.created_at <= ?
          AND NOT EXISTS (SELECT 1 FROM retail_sales s WHERE s.square_order_id = r.order_id AND s.is_return = 1)
        ORDER BY r.created_at`
    )
    .all(`${from} 00:00`, `${to} 23:59`);
  const linesOf = db.prepare(
    `SELECT s.name, s.kind, s.net, v.name AS vendor_name FROM retail_sales s
       LEFT JOIN inventory_items i ON i.id = s.item_id LEFT JOIN vendors v ON v.id = i.vendor_id
      WHERE s.square_order_id = ? AND s.is_return = 0`
  );
  return rows.map((r) => ({ ...r, lines: r.order_id ? linesOf.all(r.order_id) : [] }));
}

/**
 * Pull completed register sales since the last sync (re-reading a two-hour
 * overlap; duplicates are ignored by the unique index), then refresh every
 * item's on-hand count from Square.
 */
export async function syncSquareSales({ now = new Date() } = {}) {
  const through = getSetting("square_sales_synced_through", "");
  // Re-read three days back: a register that was offline uploads its sales
  // late, dated when they happened. Repeats are dropped by the unique index.
  const start = through ? new Date(new Date(through).getTime() - 3 * 86400 * 1000) : new Date(now.getTime() - 30 * 86400 * 1000);
  const { orders, simulated } = await fetchCompletedOrders(start.toISOString(), now.toISOString());
  const added = saveSaleLines(linesFromOrders(orders));
  const { refunds } = await fetchRefunds(start.toISOString(), now.toISOString());
  saveRefunds(refunds);

  const items = db.prepare("SELECT id, square_variation_id FROM inventory_items WHERE square_variation_id IS NOT NULL").all();
  const { counts } = await fetchCounts(items.map((i) => i.square_variation_id));
  const setCount = db.prepare("UPDATE inventory_items SET qty_on_hand = ?, synced_at = datetime('now') WHERE id = ?");
  let recounted = 0;
  db.transaction(() => {
    for (const i of items) {
      if (counts[i.square_variation_id] == null) continue;
      setCount.run(counts[i.square_variation_id], i.id);
      recounted++;
    }
  })();
  if (!simulated) setSetting("square_sales_synced_through", now.toISOString());
  setSetting("square_sales_last_run", now.toISOString());
  // Also catch anything added or restocked in Square that needs price tags.
  await refreshTagWatch({ force: true }).catch((err) => console.error("[tags] Square check failed", err.message));
  return { simulated, orders: orders.length, added, recounted };
}

// ---------------------------------------------------------------------------
// Reports: what sold, what's owed
// ---------------------------------------------------------------------------

/** Sales lines between two venue-local dates, with their item and vendor. */
export function listSales({ from, to, vendorId, kind } = {}) {
  const where = [];
  const params = [];
  if (from) {
    where.push("s.sold_at >= ?");
    params.push(`${from} 00:00`);
  }
  if (to) {
    where.push("s.sold_at <= ?");
    params.push(`${to} 23:59`);
  }
  if (vendorId) {
    where.push("i.vendor_id = ?");
    params.push(vendorId);
  }
  if (kind) {
    where.push("s.kind = ?");
    params.push(kind);
  }
  return db
    .prepare(
      `SELECT s.*, i.ownership, i.unit_cost, i.split AS item_split, i.vendor_id,
              v.name AS vendor_name, v.default_split AS vendor_split
         FROM retail_sales s
         LEFT JOIN inventory_items i ON i.id = s.item_id
         LEFT JOIN vendors v ON v.id = i.vendor_id
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY s.sold_at DESC, s.id DESC`
    )
    .all(...params);
}

function splitOf(line) {
  return line.item_split != null ? Number(line.item_split) : line.vendor_split != null ? Number(line.vendor_split) : defaultSplit();
}

/**
 * What a consignor is owed on one sold line (negative for a return), at the
 * split saved on the line when it synced — so changing a maker's split later
 * never re-prices sales already made. Older lines fall back to today's split.
 */
export function consignorShare(line) {
  if (line.ownership !== "consignment") return 0;
  const split = line.split != null ? Number(line.split) : splitOf(line);
  return round2((Number(line.net) * split) / 100);
}

/**
 * Totals for a date range: register sales split retail / ticket / rental /
 * deposit, retail split into makers' (consigned) and The Alley's own (anything
 * this site didn't create — bought stock added straight in Square, and custom
 * amounts), tax collected and the makers' share.
 */
export function salesSummary(from, to) {
  const lines = listSales({ from, to });
  const sum = (arr, k) => round2(arr.reduce((t, l) => t + (Number(l[k]) || 0), 0));
  const by = (kind) => lines.filter((l) => l.kind === kind);
  const retail = by("retail");
  const consigned = retail.filter((l) => l.ownership === "consignment");
  const owned = retail.filter((l) => l.ownership !== "consignment");
  const custom = owned.filter((l) => !l.catalog_object_id);
  const consignorShareTotal = round2(consigned.reduce((t, l) => t + consignorShare(l), 0));
  const totals = (arr) => ({
    gross: sum(arr, "gross"),
    discount: sum(arr, "discount"),
    net: sum(arr, "net"),
    tax: sum(arr, "tax"),
    total: sum(arr, "total"),
    count: arr.length,
  });
  return {
    lines,
    retail: totals(retail),
    consigned: totals(consigned),
    owned: totals(owned),
    custom: totals(custom),
    tickets: totals(by("ticket")),
    rental: totals(by("rental")),
    deposit: totals(by("deposit")),
    all: totals(lines),
    consignorShare: consignorShareTotal,
    shopShareOfConsigned: round2(totals(consigned).net - consignorShareTotal),
  };
}

/**
 * Makers are paid MONTHLY, for everything sold in the months before this one:
 * the last day of last month is the cut-off a payout covers by default.
 */
export function payoutCutoff(today = venueNow().slice(0, 10)) {
  const [y, m] = today.split("-").map(Number);
  const last = new Date(y, m - 1, 0); // day 0 of this month = last day of the previous one
  const pad = (n) => String(n).padStart(2, "0");
  return `${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}`;
}

/** Each consignor's unpaid balance — everything unpaid, or only what sold up to `through`. */
export function consignorBalances({ through = null } = {}) {
  const rows = db
    .prepare(
      `SELECT s.*, i.ownership, i.split AS item_split, i.vendor_id, v.default_split AS vendor_split
         FROM retail_sales s
         JOIN inventory_items i ON i.id = s.item_id
         JOIN vendors v ON v.id = i.vendor_id
        WHERE s.payout_id IS NULL AND i.ownership = 'consignment'
          ${through ? "AND s.sold_at <= ?" : ""}`
    )
    .all(...(through ? [`${through} 23:59`] : []));
  const out = {};
  for (const r of rows) {
    const b = (out[r.vendor_id] ||= { owed: 0, sales: 0, lines: 0, oldest: r.sold_at, newest: r.sold_at });
    b.owed = round2(b.owed + consignorShare(r));
    b.sales = round2(b.sales + Number(r.net));
    b.lines++;
    if (r.sold_at < b.oldest) b.oldest = r.sold_at;
    if (r.sold_at > b.newest) b.newest = r.sold_at;
  }
  return out;
}

/**
 * Record a payout to a consignor covering everything unpaid sold up to and
 * including `through` (a venue-local date). The amount is computed here, from
 * the lines, never typed in. Returns the payout row.
 */
export function recordPayout({ vendorId, through, method, reference, paidOn, by }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(through || ""))) throw new Error("Pick the last sale date this payout covers.");
  const today = venueNow().slice(0, 10);
  if (through > today) throw new Error("A payout can only cover sales up to today.");
  // Every sale up to `through` has to be in before it's paid, or the late ones
  // would quietly slide into next month's payout.
  if (isSquareConfigured()) {
    const synced = getSetting("square_sales_synced_through", "");
    const syncedDay = synced ? venueNow(new Date(synced)).slice(0, 10) : "";
    if (!syncedDay || syncedDay <= through) {
      throw new Error(
        `Sales are only pulled from Square up to ${syncedDay || "never"}. Press "Pull now" on the Sales page first, then record the payment.`
      );
    }
  }
  return db.transaction(() => {
    const lines = db
      .prepare(
        `SELECT s.*, i.ownership, i.split AS item_split, v.default_split AS vendor_split
           FROM retail_sales s
           JOIN inventory_items i ON i.id = s.item_id
           JOIN vendors v ON v.id = i.vendor_id
          WHERE s.payout_id IS NULL AND i.ownership = 'consignment' AND i.vendor_id = ? AND s.sold_at <= ?`
      )
      .all(vendorId, `${through} 23:59`);
    if (!lines.length) throw new Error("Nothing unpaid up to that date.");
    const amount = round2(lines.reduce((t, l) => t + consignorShare(l), 0));
    // Returns since the last payout can outweigh new sales. Nothing is paid;
    // the lines stay unpaid and come off the next payout instead.
    if (amount <= 0) {
      throw new Error(
        `Nothing to pay — returns since the last payout come to $${round2(-amount).toFixed(2)} more than new sales. That carries over and comes off their next payout.`
      );
    }
    const salesTotal = round2(lines.reduce((t, l) => t + Number(l.net), 0));
    const id = db
      .prepare(
        `INSERT INTO consignor_payouts (vendor_id, through, amount, sales_total, line_count, method, reference, paid_on, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(vendorId, through, amount, salesTotal, lines.length, cleanText(method), cleanText(reference), paidOn || venueNow().slice(0, 10), by)
      .lastInsertRowid;
    const mark = db.prepare("UPDATE retail_sales SET payout_id = ? WHERE id = ?");
    for (const l of lines) mark.run(id, l.id);
    return db.prepare("SELECT * FROM consignor_payouts WHERE id = ?").get(id);
  })();
}

export function listPayouts({ vendorId, from, to } = {}) {
  const where = [];
  const params = [];
  if (vendorId) {
    where.push("p.vendor_id = ?");
    params.push(vendorId);
  }
  if (from) {
    where.push("p.paid_on >= ?");
    params.push(from);
  }
  if (to) {
    where.push("p.paid_on <= ?");
    params.push(to);
  }
  return db
    .prepare(
      `SELECT p.*, v.name AS vendor_name FROM consignor_payouts p JOIN vendors v ON v.id = p.vendor_id
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY p.paid_on DESC, p.id DESC`
    )
    .all(...params);
}

/** The sales lines a payout covered, each with the maker's share — for their statement. */
export function payoutLines(payoutId) {
  return db
    .prepare(
      `SELECT s.*, i.ownership, i.split AS item_split, v.default_split AS vendor_split
         FROM retail_sales s
         JOIN inventory_items i ON i.id = s.item_id
         JOIN vendors v ON v.id = i.vendor_id
        WHERE s.payout_id = ? ORDER BY s.sold_at, s.id`
    )
    .all(payoutId)
    .map((l) => ({ ...l, share: consignorShare(l) }));
}

// ---------------------------------------------------------------------------
// Consignment terms
// ---------------------------------------------------------------------------

export function pickupDays() {
  const n = Number(getSetting("consignment_pickup_days", "90"));
  return Number.isInteger(n) && n > 0 ? n : 90;
}

/**
 * The terms as one maker sees them ({split} and {days} filled in), and a
 * version that changes whenever the words do — so editing the terms, or a
 * maker's split, asks them to agree again.
 */
export function termsFor(vendor) {
  const split = vendor?.default_split != null ? Number(vendor.default_split) : defaultSplit();
  const text = getSetting("consignment_terms", "")
    .replaceAll("{split}", String(split))
    .replaceAll("{days}", String(pickupDays()));
  return { text, version: createHash("sha256").update(text).digest("hex").slice(0, 16) };
}

export function termsAreDraft() {
  return getSetting("consignment_terms_draft", "0") === "1";
}

export function needsTerms(vendor) {
  return vendor?.terms_version !== termsFor(vendor).version;
}

export function saveTerms({ text, days }) {
  const t = String(text || "").trim();
  if (t.length < 40) throw new Error("The terms look empty — write them out in full.");
  const d = Number.parseInt(days, 10);
  if (!Number.isInteger(d) || d < 7 || d > 730) throw new Error("Days on the shelf should be a number like 90.");
  setSetting("consignment_terms", t);
  setSetting("consignment_pickup_days", String(d));
  setSetting("consignment_terms_draft", "0");
}

/** A maker agrees: who typed their name, when, and the exact words they saw. */
export function acceptTerms(vendorId, signedName) {
  const vendor = getVendor(vendorId);
  const name = cleanText(signedName);
  if (!name) throw new Error("Type your name to agree.");
  const { text, version } = termsFor(vendor);
  db.prepare(
    `UPDATE vendors SET terms_version = ?, terms_accepted_at = datetime('now'), terms_accepted_name = ?, terms_accepted_text = ?
      WHERE id = ?`
  ).run(version, name, text, vendorId);
}

// ---------------------------------------------------------------------------
// Drop-offs: what a maker says they're bringing, before staff count it in
// ---------------------------------------------------------------------------

const MAX_WAITING = 5;
const MAX_LINES = 60;

export function submitDropoff(vendorId, { lines, notes, by }) {
  const vendor = getVendor(vendorId);
  if (!vendor?.is_active) throw new Error("This maker account isn't active.");
  if (needsTerms(vendor)) throw new Error("Please agree to the consignment terms first.");
  const waiting = db.prepare("SELECT COUNT(*) AS n FROM dropoffs WHERE vendor_id = ? AND status = 'submitted'").get(vendorId).n;
  if (waiting >= MAX_WAITING) throw new Error("You have several drop-offs waiting already — bring those in first, or cancel one.");
  const clean = [];
  for (const l of Array.isArray(lines) ? lines : []) {
    const qty = Number.parseInt(l.qty, 10);
    const item = l.itemId ? getItem(Number(l.itemId)) : null;
    const name = item ? item.name : cleanText(l.name);
    if (!name && !l.qty && !l.price) continue; // an empty row
    if (l.itemId && (!item || item.vendor_id !== vendorId)) throw new Error("One of those items isn't yours.");
    if (!name) throw new Error("Every item needs a name.");
    if (name.length > 120) throw new Error(`"${name.slice(0, 30)}…" is a long name — keep it under 120 characters.`);
    if (!Number.isInteger(qty) || qty < 1 || qty > 1000) throw new Error(`How many "${name}"? A whole number from 1 to 1000.`);
    const price = cleanMoney(l.price, `The price of "${name}"`) ?? item?.price;
    if (!price || price > 100000) throw new Error(`Give "${name}" a price.`);
    clean.push({
      itemId: item?.id ?? null,
      name,
      qty,
      price,
      group: item ? item.item_group : cleanGroup(l.group),
      photo: item ? null : cleanPhoto(l.photo),
    });
  }
  if (!clean.length) throw new Error("Add at least one item.");
  if (clean.length > MAX_LINES) throw new Error(`That's a lot — split it into drop-offs of ${MAX_LINES} items or fewer.`);
  return db.transaction(() => {
    const id = db
      .prepare("INSERT INTO dropoffs (vendor_id, notes, submitted_by) VALUES (?, ?, ?)")
      .run(vendorId, cleanText(notes)?.slice(0, 1000) ?? null, cleanText(by)).lastInsertRowid;
    const insert = db.prepare(
      "INSERT INTO dropoff_lines (dropoff_id, item_id, name, qty, price, item_group, photo) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    for (const l of clean) insert.run(id, l.itemId, l.name, l.qty, l.price, l.group, l.photo);
    return id;
  })();
}

export function getDropoff(id) {
  const d = db
    .prepare("SELECT d.*, v.name AS vendor_name FROM dropoffs d JOIN vendors v ON v.id = d.vendor_id WHERE d.id = ?")
    .get(id);
  if (!d) return null;
  return { ...d, lines: db.prepare("SELECT * FROM dropoff_lines WHERE dropoff_id = ? ORDER BY id").all(id) };
}

export function listDropoffs({ status, vendorId, limit = 100 } = {}) {
  const where = [];
  const params = [];
  if (status) {
    where.push("d.status = ?");
    params.push(status);
  }
  if (vendorId) {
    where.push("d.vendor_id = ?");
    params.push(vendorId);
  }
  return db
    .prepare(
      `SELECT d.*, v.name AS vendor_name,
              (SELECT COALESCE(SUM(qty), 0) FROM dropoff_lines l WHERE l.dropoff_id = d.id) AS units,
              (SELECT COALESCE(SUM(qty * price), 0) FROM dropoff_lines l WHERE l.dropoff_id = d.id) AS value,
              (SELECT COUNT(*) FROM dropoff_lines l WHERE l.dropoff_id = d.id) AS line_count
         FROM dropoffs d JOIN vendors v ON v.id = d.vendor_id
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY d.created_at DESC, d.id DESC LIMIT ?`
    )
    .all(...params, limit);
}

export function countWaitingDropoffs() {
  return db.prepare("SELECT COUNT(*) AS n FROM dropoffs WHERE status = 'submitted'").get().n;
}

/** The maker changed their mind — only while it's still waiting. */
export function cancelDropoff(vendorId, id) {
  const r = db
    .prepare("UPDATE dropoffs SET status = 'cancelled', decided_at = datetime('now') WHERE id = ? AND vendor_id = ? AND status = 'submitted'")
    .run(id, vendorId);
  if (!r.changes) throw new Error("That drop-off can't be cancelled now.");
}

export function declineDropoff(id, reason, by) {
  const r = db
    .prepare(
      `UPDATE dropoffs SET status = 'declined', decline_reason = ?, decided_by = ?, decided_at = datetime('now')
        WHERE id = ? AND status = 'submitted'`
    )
    .run(cleanText(reason), by, id);
  if (!r.changes) throw new Error("That drop-off was already dealt with.");
}

/** Staff counted it in: it became stock sheet `intakeId`. */
export function markDropoffAccepted(id, intakeId, by) {
  db.prepare(
    `UPDATE dropoffs SET status = 'accepted', intake_id = ?, decided_by = ?, decided_at = datetime('now')
      WHERE id = ? AND status = 'submitted'`
  ).run(intakeId, by, id);
}

// ---------------------------------------------------------------------------
// A maker's own view (their account or private link)
// ---------------------------------------------------------------------------

function monthStart(date) {
  return `${date.slice(0, 7)}-01`;
}

export function makerOverview(vendorId, today = venueNow().slice(0, 10)) {
  const vendor = getVendor(vendorId);
  const items = db
    .prepare(
      `SELECT i.*,
              (SELECT MIN(s.received_on) FROM stock_intake_lines l JOIN stock_intakes s ON s.id = l.intake_id
                WHERE l.item_id = i.id AND l.qty > 0) AS first_received,
              (SELECT COALESCE(SUM(r.qty), 0) FROM retail_sales r WHERE r.item_id = i.id) AS sold
         FROM inventory_items i
        WHERE i.vendor_id = ? AND (i.status = 'active' OR i.qty_on_hand > 0)
        ORDER BY i.name COLLATE NOCASE`
    )
    .all(vendorId);
  const days = pickupDays();
  const thisMonth = monthStart(today);
  const lastMonth = shiftDate(thisMonth, { months: -1 });
  const withShare = (rows) => rows.map((l) => ({ ...l, share: consignorShare(l) }));
  const cutoff = payoutCutoff(today);
  const due = consignorBalances({ through: cutoff })[vendorId]?.owed || 0;
  const unpaid = consignorBalances()[vendorId]?.owed || 0;
  return {
    vendor,
    split: splitFor(null, vendor),
    pickupDays: days,
    items: items.map((i) => ({
      ...i,
      daysOnShelf: i.first_received ? Math.floor((Date.parse(today) - Date.parse(i.first_received)) / 86400000) : null,
    })),
    onShelf: items.reduce((t, i) => t + Math.max(0, i.qty_on_hand), 0),
    salesThisMonth: withShare(listSales({ from: thisMonth, to: today, vendorId, kind: "retail" })),
    salesLastMonth: withShare(listSales({ from: lastMonth, to: shiftDate(thisMonth, { days: -1 }), vendorId, kind: "retail" })),
    due,
    dueThrough: cutoff,
    soFarThisMonth: round2(unpaid - due),
    payouts: listPayouts({ vendorId }),
    dropoffs: listDropoffs({ vendorId, limit: 20 }),
    lastSynced: getSetting("square_sales_last_run", ""),
  };
}

/**
 * What's selling, for a maker's "How it's selling" panel (components/maker/
 * SalesInsights.js): every item they've had with us, and per period (this
 * month, last month, this year, all time) what each sold, after discounts and
 * as their share. Plus their share month by month for the last year.
 */
export function makerInsights(vendorId, today = venueNow().slice(0, 10)) {
  const items = db
    .prepare(
      `SELECT id, name, item_group, price, maker_cost, qty_on_hand, status, photo FROM inventory_items
        WHERE vendor_id = ? ORDER BY name COLLATE NOCASE`
    )
    .all(vendorId)
    .map((i) => ({
      id: i.id,
      name: i.name,
      short: shortName(i.name, i.item_group),
      group: i.item_group,
      price: i.price,
      cost: i.maker_cost,
      photo: i.photo,
      left: Math.max(0, i.qty_on_hand),
      active: i.status === "active" || i.qty_on_hand > 0,
    }));
  const lines = listSales({ vendorId, kind: "retail" }).filter((l) => l.item_id);
  const thisMonth = monthStart(today);
  const lastMonth = shiftDate(thisMonth, { months: -1 });
  const periods = [
    { key: "month", label: "This month", from: thisMonth, to: today },
    { key: "last", label: "Last month", from: lastMonth, to: shiftDate(thisMonth, { days: -1 }) },
    { key: "year", label: "This year", from: `${today.slice(0, 4)}-01-01`, to: today },
    { key: "all", label: "All time", from: "", to: today },
  ].map((p) => {
    const byItem = {};
    for (const l of lines) {
      const day = l.sold_at.slice(0, 10);
      if ((p.from && day < p.from) || day > p.to) continue;
      const b = (byItem[l.item_id] ||= { qty: 0, net: 0, share: 0 });
      b.qty += Number(l.qty) || 0;
      b.net = round2(b.net + Number(l.net));
      b.share = round2(b.share + consignorShare(l));
    }
    return { key: p.key, label: p.label, byItem };
  });
  const months = [];
  for (let k = 11; k >= 0; k--) {
    const start = shiftDate(thisMonth, { months: -k });
    const ym = start.slice(0, 7);
    const inMonth = lines.filter((l) => l.sold_at.slice(0, 7) === ym);
    months.push({
      ym,
      label: new Date(`${start}T12:00:00`).toLocaleDateString("en-US", { month: "short" }),
      qty: inMonth.reduce((t, l) => t + (Number(l.qty) || 0), 0),
      share: round2(inMonth.reduce((t, l) => t + consignorShare(l), 0)),
    });
  }
  return { items, periods, months };
}

// ---------------------------------------------------------------------------
// The whole shop's catalog: price tags and shelf counts
// ---------------------------------------------------------------------------

/**
 * Every sellable thing in Square — makers' items and The Alley's own — with
 * its maker (if it's one of ours), SKU and live count. Without Square
 * connected (local copies), just the items this site made.
 */
export async function shopCatalog() {
  const local = db
    .prepare(
      `SELECT i.*, v.name AS vendor_name FROM inventory_items i LEFT JOIN vendors v ON v.id = i.vendor_id
        WHERE i.square_variation_id IS NOT NULL`
    )
    .all();
  const byVariation = Object.fromEntries(local.map((i) => [i.square_variation_id, i]));
  const simulated = !isSquareConfigured();
  const rows = simulated
    ? local
        .filter((i) => i.status === "active" || i.qty_on_hand > 0)
        .map((i) => ({
          itemId: i.square_item_id,
          variationId: i.square_variation_id,
          name: i.name,
          variationName: "",
          sku: i.sku || "",
          price: i.price,
          categoryId: i.vendor_id ? `vendor-${i.vendor_id}` : null,
          categoryName: i.vendor_name || "",
          tracked: true,
        }))
    : await listCatalog();
  const { counts } = simulated ? { counts: {} } : await fetchCounts(rows.filter((r) => r.tracked).map((r) => r.variationId));
  for (const r of rows) {
    const mine = byVariation[r.variationId];
    r.maker = mine?.vendor_name || null;
    r.localItemId = mine?.id || null;
    r.count = simulated ? mine?.qty_on_hand ?? null : r.tracked ? counts[r.variationId] ?? 0 : null;
  }
  rows.sort((a, b) => (a.categoryName || "~").localeCompare(b.categoryName || "~") || a.name.localeCompare(b.name));
  return { rows, simulated };
}

/** Next "22…" number for something made straight in Square (see skuFor). */
function nextSquareSku(taken = new Set()) {
  return db.transaction(() => {
    let n = Number(getSetting("square_sku_next", "1")) || 1;
    // Skip any number already in Square (say the counter went back with a
    // restored database) — two items on one tag would ring up the wrong one.
    while (taken.has(`22${String(n).padStart(6, "0")}`)) n++;
    setSetting("square_sku_next", String(n + 1));
    return `22${String(n).padStart(6, "0")}`;
  })();
}

/**
 * Give every catalog item that has no SKU one, so it can carry a barcode tag.
 * Only touches items without a SKU — never changes one that exists (a
 * manufacturer's barcode, say). `onlyIds` limits it to those variations.
 */
export async function giveBarcodes(onlyIds = null) {
  const { rows } = await shopCatalog();
  const want = rows.filter((r) => !r.sku && (!onlyIds || onlyIds.includes(r.variationId)));
  if (!want.length) return { given: 0 };
  const taken = new Set(rows.map((r) => r.sku).filter(Boolean));
  const skus = Object.fromEntries(want.map((r) => [r.variationId, r.localItemId ? skuFor(r.localItemId) : nextSquareSku(taken)]));
  await setSkus(skus);
  for (const r of want) {
    if (r.localItemId) db.prepare("UPDATE inventory_items SET sku = ? WHERE id = ?").run(skus[r.variationId], r.localItemId);
  }
  return { given: want.length };
}

export const TAG_FORMATS = {
  sheet30: { label: "Avery 5160 / 8160 sheet — 30 per page, any printer", perPage: 30 },
  sheet80: { label: "Avery 5167 sheet — 80 small tags per page (jewellery)", perPage: 80 },
  roll: { label: "Label printer roll — 2 × 1 in", perPage: 1 },
  roll15: { label: "Label printer roll — 1½ × 1 in", perPage: 1 },
};

/** What goes on the tag for the register to scan. Both carry the item's SKU. */
export const TAG_CODES = {
  qr: "QR code",
  barcode: "Barcode",
};

/** Save a sheet of tags to print: items = [{ variationId, qty }]. Returns its id. */
export function createTagPrint({ format, code = "barcode", startAt = 1, items, by, intakeId = null }) {
  if (!TAG_FORMATS[format]) throw new Error("Pick a label type.");
  if (!TAG_CODES[code]) throw new Error("Pick QR code or barcode.");
  const clean = (items || [])
    .map((i) => ({ variationId: String(i.variationId || ""), qty: Number.parseInt(i.qty, 10) || 0 }))
    .filter((i) => i.variationId && i.qty > 0);
  if (!clean.length) throw new Error("Pick at least one item and how many tags.");
  if (clean.some((i) => i.qty > 500) || clean.reduce((t, i) => t + i.qty, 0) > 3000) {
    throw new Error("That's more tags than one print run should be — do it in smaller batches.");
  }
  const start = Math.min(Math.max(Number.parseInt(startAt, 10) || 1, 1), TAG_FORMATS[format].perPage);
  return db
    .prepare("INSERT INTO tag_prints (format, code, start_at, items_json, created_by, intake_id) VALUES (?, ?, ?, ?, ?, ?)")
    .run(format, code, start, JSON.stringify(clean), by, intakeId).lastInsertRowid;
}

/** Tags for a stock sheet: one per unit received. */
export function tagItemsForIntake(intakeId) {
  const intake = getIntake(intakeId);
  if (!intake) return [];
  const qty = {};
  for (const l of intake.lines) {
    if (l.square_variation_id && l.qty > 0) qty[l.square_variation_id] = (qty[l.square_variation_id] || 0) + l.qty;
  }
  return Object.entries(qty).map(([variationId, n]) => ({ variationId, qty: n }));
}

/** A saved print, expanded into one entry per tag: { job, format, tags: [{ name, price, sku, maker }] }. */
export async function tagSheet(id) {
  const job = db.prepare("SELECT * FROM tag_prints WHERE id = ?").get(id);
  if (!job) return null;
  const { rows } = await shopCatalog();
  const byVariation = Object.fromEntries(rows.map((r) => [r.variationId, r]));
  const tags = [];
  for (const { variationId, qty } of JSON.parse(job.items_json)) {
    const r = byVariation[variationId];
    if (!r) continue;
    const tag = {
      name: [r.name, r.variationName].filter(Boolean).join(" · "),
      price: r.price,
      sku: r.sku,
      maker: r.maker,
    };
    for (let n = 0; n < qty; n++) tags.push(tag);
  }
  return { job, format: TAG_FORMATS[job.format], tags };
}

/**
 * Apply a shelf count. Each entry is what the screen showed (`baseline`) and
 * what was counted; Square gets the DIFFERENCE, so a sale rung up while
 * someone was counting isn't wiped out. Returns { changed, net }.
 */
export async function applyCount(entries, { key } = {}) {
  const changes = [];
  for (const e of entries || []) {
    const counted = Number.parseInt(e.counted, 10);
    const baseline = Number.parseInt(e.baseline, 10);
    if (!e.variationId || !Number.isInteger(counted) || counted < 0 || counted > 100000 || !Number.isInteger(baseline)) continue;
    if (counted !== baseline) changes.push({ variationId: String(e.variationId), delta: counted - baseline });
  }
  if (!changes.length) return { changed: 0, net: 0 };
  await adjustStock(changes, key ? { keyPrefix: `alley-count-${key}` } : undefined);
  const bump = db.prepare("UPDATE inventory_items SET qty_on_hand = MAX(0, qty_on_hand + ?) WHERE square_variation_id = ?");
  db.transaction(() => {
    for (const c of changes) bump.run(c.delta, c.variationId);
  })();
  return { changed: changes.length, net: changes.reduce((t, c) => t + c.delta, 0) };
}

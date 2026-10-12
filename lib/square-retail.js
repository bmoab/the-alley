import { randomUUID } from "node:crypto";
import { isSquareConfigured } from "./square.js";

/**
 * Square retail: the catalog, stock counts and register sales (server-only).
 *
 * The website is where makers' stock is RECEIVED (it knows whose it is and
 * their share — Square's free plan has no consignment); Square is the register,
 * and the source of truth for what SOLD and how many are left. Things The Alley
 * buys outright are added straight in Square. So this module only ever:
 *   - creates/updates an item + variation in the catalog when stock comes in,
 *   - adds stock, corrects counts, and gives items SKUs for price tags,
 *   - reads the catalog, completed orders and current counts back.
 *
 * Same SIMULATED fallback as lib/square.js: with no token configured nothing
 * leaves the building and every call logs what it would have done.
 */

const TOKEN = process.env.SQUARE_ACCESS_TOKEN;
const LOCATION_ID = process.env.SQUARE_LOCATION_ID;
const ENVIRONMENT = process.env.SQUARE_ENVIRONMENT || "sandbox";

function apiBase() {
  return ENVIRONMENT === "production" ? "https://connect.squareup.com" : "https://connect.squareupsandbox.com";
}

async function squareFetch(path, body, method = "POST") {
  const res = await fetch(`${apiBase()}${path}`, {
    method,
    headers: {
      "Square-Version": "2024-09-19",
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.errors?.[0]?.detail || res.statusText;
    throw new Error(`Square API ${res.status}: ${msg}`);
  }
  return data;
}

export const toCents = (n) => Math.round((Number(n) || 0) * 100);

/**
 * An id saved while Square wasn't connected ("SIM-…") points at nothing real.
 * Once Square IS connected, treat it as never created so it gets made for real
 * (a copied local database, or a deploy that briefly lost its token).
 */
export function realId(id) {
  if (!id) return null;
  return isSquareConfigured() && String(id).startsWith("SIM-") ? null : id;
}
export const fromMoney = (m) => (m?.amount || 0) / 100;

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

/**
 * Find or create the catalog category a maker's items are filed under, so
 * Square's own reports can be split by vendor too. Returns its id.
 */
export async function ensureCategory(name, existingId = null) {
  if (existingId) return existingId;
  if (!isSquareConfigured()) {
    const id = `SIM-CAT-${randomUUID().slice(0, 8)}`;
    console.log(`[square:SIMULATED] Would create category "${name}" → ${id}`);
    return id;
  }
  const res = await squareFetch("/v2/catalog/object", {
    idempotency_key: randomUUID(),
    object: { type: "CATEGORY", id: "#category", category_data: { name } },
  });
  return res.catalog_object.id;
}

/**
 * The sales taxes set up in Square (Dashboard → Settings → Sales taxes) that are
 * switched on and apply at The Alley's location: [{ id, name, percentage }].
 *
 * This matters more than it looks: Square applies tax to a catalog item only if
 * the item lists the tax in `tax_ids`. An item created through the API with no
 * tax_ids rings up TAX-FREE at the register — the dashboard's "apply to all new
 * items" switch doesn't cover API-created items. So every item this site
 * creates is given these ids, and creating one is refused if there are none.
 */
export async function salesTaxes() {
  if (!isSquareConfigured()) return [{ id: "SIM-TAX", name: "Sales tax (simulated)", percentage: "7.0", simulated: true }];
  const taxes = [];
  let cursor;
  do {
    const res = await squareFetch("/v2/catalog/search", { object_types: ["TAX"], include_deleted_objects: false, cursor });
    for (const o of res.objects || []) {
      const t = o.tax_data || {};
      const here =
        o.present_at_all_locations !== false
          ? !(o.absent_at_location_ids || []).includes(LOCATION_ID)
          : (o.present_at_location_ids || []).includes(LOCATION_ID);
      if (t.enabled !== false && here) taxes.push({ id: o.id, name: t.name, percentage: t.percentage });
    }
    cursor = res.cursor;
  } while (cursor);
  return taxes;
}

async function requireTaxIds() {
  const taxes = await salesTaxes();
  if (!taxes.length) {
    throw new Error(
      "Square has no sales tax switched on for this location. Add it in Square Dashboard → Settings → Sales taxes, then try again — otherwise these would ring up untaxed."
    );
  }
  // Two switched on (say an old rate left on beside the new one) would tax
  // every item twice over.
  if (taxes.length > 1) {
    throw new Error(
      `Square has ${taxes.length} sales taxes switched on (${taxes.map((t) => `${t.name} ${t.percentage}%`).join(", ")}). Switch off all but the one for Logan in Square Dashboard → Settings → Sales taxes, then try again.`
    );
  }
  return taxes.map((t) => t.id);
}

/**
 * Create a new sellable item with one variation, taxed with the location's
 * sales tax. Returns { itemId, variationId, simulated }.
 * `trackInventory` false = unlimited (e.g. tickets with no spot limit).
 */
export async function createCatalogItem({ name, sku, price, categoryId, description, trackInventory = true, idempotencyKey = randomUUID() }) {
  if (!isSquareConfigured()) {
    const tag = randomUUID().slice(0, 8);
    console.log(`[square:SIMULATED] Would create taxed item "${name}" sku=${sku} $${Number(price).toFixed(2)}`);
    return { itemId: `SIM-ITEM-${tag}`, variationId: `SIM-VAR-${tag}`, simulated: true };
  }
  const taxIds = await requireTaxIds();
  const res = await squareFetch("/v2/catalog/batch-upsert", {
    // A fixed key per item (from the caller) means a retry after a lost
    // response gets the same item back instead of making a second one.
    idempotency_key: idempotencyKey,
    batches: [
      {
        objects: [
          {
            type: "ITEM",
            id: "#item",
            present_at_all_locations: true,
            item_data: {
              name,
              description: description || undefined,
              is_taxable: true,
              tax_ids: taxIds,
              categories: categoryId && !String(categoryId).startsWith("SIM-") ? [{ id: categoryId }] : undefined,
              variations: [
                {
                  type: "ITEM_VARIATION",
                  id: "#variation",
                  present_at_all_locations: true,
                  item_variation_data: {
                    item_id: "#item",
                    name: "Regular",
                    sku: sku || undefined,
                    pricing_type: "FIXED_PRICING",
                    price_money: { amount: toCents(price), currency: "USD" },
                    track_inventory: trackInventory,
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  });
  const map = Object.fromEntries((res.id_mappings || []).map((m) => [m.client_object_id, m.object_id]));
  return { itemId: map["#item"], variationId: map["#variation"], simulated: false };
}

/** Change a variation's price (it has to be re-sent with its current version). */
export async function updateVariationPrice(variationId, price) {
  if (!isSquareConfigured() || String(variationId).startsWith("SIM-")) {
    console.log(`[square:SIMULATED] Would set ${variationId} to $${Number(price).toFixed(2)}`);
    return { simulated: true };
  }
  const { object } = await squareFetch(`/v2/catalog/object/${variationId}`, null, "GET");
  object.item_variation_data.price_money = { amount: toCents(price), currency: "USD" };
  object.item_variation_data.pricing_type = "FIXED_PRICING";
  await squareFetch("/v2/catalog/object", { idempotency_key: randomUUID(), object });
  return { simulated: false };
}

/**
 * The whole sellable catalog — every item and variation, whoever made it
 * (this site, or someone typing it straight into Square) — for price tags and
 * shelf counts. Returns [{ itemId, variationId, name, variationName, sku,
 * price, categoryId, categoryName, tracked }]. Empty when Square isn't connected.
 */
export async function listCatalog() {
  if (!isSquareConfigured()) return [];
  const objects = [];
  let cursor;
  do {
    const qs = new URLSearchParams({ types: "ITEM,CATEGORY" });
    if (cursor) qs.set("cursor", cursor);
    const res = await squareFetch(`/v2/catalog/list?${qs}`, null, "GET");
    objects.push(...(res.objects || []));
    cursor = res.cursor;
  } while (cursor);
  const here = (o) =>
    o.present_at_all_locations !== false
      ? !(o.absent_at_location_ids || []).includes(LOCATION_ID)
      : (o.present_at_location_ids || []).includes(LOCATION_ID);
  const categories = Object.fromEntries(
    objects.filter((o) => o.type === "CATEGORY" && !o.is_deleted).map((o) => [o.id, o.category_data?.name || ""])
  );
  const out = [];
  for (const o of objects) {
    if (o.type !== "ITEM" || o.is_deleted || o.item_data?.is_archived || !here(o)) continue;
    const d = o.item_data || {};
    const categoryId = d.categories?.[0]?.id || d.reporting_category?.id || d.category_id || null;
    for (const v of d.variations || []) {
      if (v.is_deleted || !here(v)) continue;
      const vd = v.item_variation_data || {};
      out.push({
        itemId: o.id,
        variationId: v.id,
        name: d.name || "",
        variationName: vd.name && vd.name !== "Regular" ? vd.name : "",
        sku: vd.sku || "",
        price: vd.price_money ? fromMoney(vd.price_money) : null,
        categoryId,
        categoryName: categoryId ? categories[categoryId] || "" : "",
        tracked: trackedHere(vd),
      });
    }
  }
  return out;
}

/** Whether Square counts stock for this variation here (a location can override the item). */
function trackedHere(vd) {
  const override = (vd.location_overrides || []).find((o) => o.location_id === LOCATION_ID);
  if (override && override.track_inventory != null) return override.track_inventory === true;
  return vd.track_inventory === true;
}

/**
 * Give variations a SKU (the number a price-tag barcode carries — Square's
 * register finds an item by its SKU when one is scanned or typed).
 * `skus` = { [variationId]: sku }. Each is re-sent with its current version.
 */
export async function setSkus(skus) {
  const ids = Object.keys(skus).filter((id) => !String(id).startsWith("SIM-"));
  if (!isSquareConfigured() || !ids.length) {
    for (const [id, sku] of Object.entries(skus)) console.log(`[square:SIMULATED] Would set SKU of ${id} to ${sku}`);
    return { simulated: true };
  }
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const { objects = [] } = await squareFetch("/v2/catalog/batch-retrieve", { object_ids: chunk });
    for (const o of objects) o.item_variation_data.sku = skus[o.id];
    await squareFetch("/v2/catalog/batch-upsert", { idempotency_key: randomUUID(), batches: [{ objects }] });
  }
  return { simulated: false };
}

// ---------------------------------------------------------------------------
// Stock
// ---------------------------------------------------------------------------

/**
 * Add received stock: NONE → IN_STOCK, the way Square records a delivery.
 * Pass a fixed `idempotencyKey` AND `occurredAt` for anything that may be
 * retried: Square only treats a repeat as "already done" when the body is
 * identical, so a fresh timestamp on retry would be refused instead.
 */
export async function addStock(changes, { idempotencyKey = randomUUID(), occurredAt = new Date().toISOString() } = {}) {
  const real = changes.filter((c) => c.qty > 0 && !String(c.variationId).startsWith("SIM-"));
  if (!isSquareConfigured() || real.length === 0) {
    for (const c of changes) console.log(`[square:SIMULATED] Would add ${c.qty} of ${c.variationId}`);
    return { simulated: true };
  }
  // Square takes at most 100 changes per request.
  for (let i = 0; i < real.length; i += 100) {
    await squareFetch("/v2/inventory/changes/batch-create", {
      idempotency_key: i ? `${idempotencyKey}-${i / 100}` : idempotencyKey,
      ignore_unchanged_counts: true,
      changes: real.slice(i, i + 100).map((c) => ({
        type: "ADJUSTMENT",
        adjustment: {
          catalog_object_id: c.variationId,
          location_id: LOCATION_ID,
          from_state: "NONE",
          to_state: "IN_STOCK",
          quantity: String(c.qty),
          occurred_at: occurredAt,
        },
      })),
    });
  }
  return { simulated: false };
}

/**
 * Take stock off the shelf without a sale (handed back to its maker, damaged,
 * lost). RELATIVE — IN_STOCK → WASTE — so it can't clobber sales Square has
 * rung up since the site last looked, the way setting an absolute count could.
 */
export async function removeStock(variationId, qty, { idempotencyKey = randomUUID(), occurredAt = new Date().toISOString() } = {}) {
  if (!isSquareConfigured() || String(variationId).startsWith("SIM-")) {
    console.log(`[square:SIMULATED] Would remove ${qty} of ${variationId}`);
    return { simulated: true };
  }
  await squareFetch("/v2/inventory/changes/batch-create", {
    idempotency_key: idempotencyKey,
    changes: [
      {
        type: "ADJUSTMENT",
        adjustment: {
          catalog_object_id: variationId,
          location_id: LOCATION_ID,
          from_state: "IN_STOCK",
          to_state: "WASTE",
          quantity: String(qty),
          occurred_at: occurredAt,
        },
      },
    ],
  });
  return { simulated: false };
}

/**
 * Shelf-count corrections, RELATIVE: + for found (NONE → IN_STOCK), − for
 * missing (IN_STOCK → WASTE). `changes` = [{ variationId, delta }].
 */
export async function adjustStock(changes, { keyPrefix = randomUUID() } = {}) {
  const real = changes.filter((c) => c.delta && !String(c.variationId).startsWith("SIM-"));
  if (!isSquareConfigured() || !real.length) {
    for (const c of changes) console.log(`[square:SIMULATED] Would adjust ${c.variationId} by ${c.delta}`);
    return { simulated: true };
  }
  const occurredAt = new Date().toISOString();
  for (let i = 0; i < real.length; i += 100) {
    await squareFetch("/v2/inventory/changes/batch-create", {
      // One key per count + chunk: a double-submitted count is applied once.
      idempotency_key: `${keyPrefix}-${i / 100}`,
      changes: real.slice(i, i + 100).map((c) => ({
        type: "ADJUSTMENT",
        adjustment: {
          catalog_object_id: c.variationId,
          location_id: LOCATION_ID,
          from_state: c.delta > 0 ? "NONE" : "IN_STOCK",
          to_state: c.delta > 0 ? "IN_STOCK" : "WASTE",
          quantity: String(Math.abs(c.delta)),
          occurred_at: occurredAt,
        },
      })),
    });
  }
  return { simulated: false };
}

/** Current in-stock counts: { [variationId]: number }. Simulated ids are skipped. */
export async function fetchCounts(variationIds) {
  const ids = variationIds.filter((id) => id && !String(id).startsWith("SIM-"));
  if (!isSquareConfigured() || ids.length === 0) return { counts: {}, simulated: true };
  const counts = {};
  for (let i = 0; i < ids.length; i += 500) {
    let cursor;
    do {
      const res = await squareFetch("/v2/inventory/counts/batch-retrieve", {
        catalog_object_ids: ids.slice(i, i + 500),
        location_ids: [LOCATION_ID],
        states: ["IN_STOCK"],
        cursor,
      });
      for (const c of res.counts || []) counts[c.catalog_object_id] = Number(c.quantity) || 0;
      cursor = res.cursor;
    } while (cursor);
  }
  return { counts, simulated: false };
}

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------

async function searchOrders(filter, sortField) {
  const orders = [];
  let cursor;
  do {
    const res = await squareFetch("/v2/orders/search", {
      location_ids: [LOCATION_ID],
      limit: 500,
      cursor,
      query: { filter, sort: { sort_field: sortField, sort_order: "ASC" } },
    });
    orders.push(...(res.orders || []));
    cursor = res.cursor;
  } while (cursor);
  return orders;
}

/**
 * Paid orders from [startIso, endIso), oldest first: everything COMPLETED
 * (closed) in the window, plus orders still OPEN but fully paid — an online
 * checkout whose order carries a fulfillment stays OPEN after payment and
 * would otherwise never be counted. Square requires the sort field to match
 * the date filter field. Repeats across runs are dropped by the caller's
 * unique index.
 */
export async function fetchCompletedOrders(startIso, endIso) {
  if (!isSquareConfigured()) return { orders: [], simulated: true };
  const completed = await searchOrders(
    { state_filter: { states: ["COMPLETED"] }, date_time_filter: { closed_at: { start_at: startIso, end_at: endIso } } },
    "CLOSED_AT"
  );
  const open = await searchOrders(
    { state_filter: { states: ["OPEN"] }, date_time_filter: { updated_at: { start_at: startIso, end_at: endIso } } },
    "UPDATED_AT"
  );
  const paidOpen = open.filter((o) => (o.tenders || []).length && (o.net_amount_due_money?.amount ?? 1) === 0);
  return { orders: [...completed, ...paidOpen], simulated: false };
}

/**
 * Refunds made in [startIso, endIso) — including ones given back as an amount
 * rather than item by item, which never show up as returned lines on an order.
 */
export async function fetchRefunds(startIso, endIso) {
  if (!isSquareConfigured()) return { refunds: [], simulated: true };
  const refunds = [];
  let cursor;
  do {
    const qs = new URLSearchParams({ begin_time: startIso, end_time: endIso, location_id: LOCATION_ID, sort_order: "ASC" });
    if (cursor) qs.set("cursor", cursor);
    const res = await squareFetch(`/v2/refunds?${qs}`, null, "GET");
    refunds.push(...(res.refunds || []));
    cursor = res.cursor;
  } while (cursor);
  return { refunds, simulated: false };
}

// ---------------------------------------------------------------------------
// Ticket checkout
// ---------------------------------------------------------------------------

/**
 * A one-off Square checkout page for `qty` of a ticket. A fresh link per
 * purchase: Square's API links are single-use, and this way the buyer picks
 * how many on our page and we can check spots first. The order uses the
 * catalog item, and auto_apply_taxes adds the item's sales tax at checkout.
 * Returns { url, orderId, simulated }.
 */
export async function createTicketCheckout({ variationId, qty, redirectUrl, note }) {
  if (!isSquareConfigured() || String(variationId).startsWith("SIM-")) {
    console.log(`[square:SIMULATED] Would open checkout for ${qty} × ${variationId} (sales tax added by Square)`);
    return { url: `${redirectUrl}${redirectUrl.includes("?") ? "&" : "?"}simulated=1`, orderId: null, simulated: true };
  }
  const res = await squareFetch("/v2/online-checkout/payment-links", {
    idempotency_key: randomUUID(),
    description: note || undefined,
    order: {
      location_id: LOCATION_ID,
      line_items: [{ catalog_object_id: variationId, quantity: String(qty) }],
      pricing_options: { auto_apply_taxes: true },
    },
    checkout_options: { redirect_url: redirectUrl, allow_tipping: false, ask_for_shipping_address: false },
  });
  return { url: res.payment_link?.url || res.payment_link?.long_url, orderId: res.payment_link?.order_id || null, simulated: false };
}

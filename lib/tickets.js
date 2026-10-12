import { db } from "./db.js";
import { ensureCategory, createCatalogItem, updateVariationPrice, addStock, fetchCounts, createTicketCheckout, salesTaxes, realId } from "./square-retail.js";
import { isSquareConfigured } from "./square.js";
import { getSetting, setSetting } from "./db.js";
import { getEventSessions } from "./catalog.js";

/**
 * Tickets The Alley sells itself, for its OWN events (server-only).
 *
 * A renter who books a room and sells tickets to their event collects any tax
 * on those tickets themselves — the room rental isn't an admission (Utah Admin.
 * Code R865-19S-33(4)). When The Alley runs the event and sells the tickets, the
 * admission IS taxable, so each ticket is a Square catalog item carrying the
 * location's sales tax: online, the buyer pays through a Square checkout that
 * adds the tax; at the door, staff ring up the same item and the register adds
 * it. Either way the sale lands in Square, the nightly sync files it under
 * "ticket", and the Sales page counts it as a taxable sale.
 */

export const MAX_PER_ORDER = 10;

/**
 * Only The Alley's own listings: no renter's booking behind it, not a tenant's
 * post, and not an invited host's (they take their own payments).
 */
export function canSellTickets(event) {
  if (!event || event.booking_id || event.tenant_id || event.host_token) return false;
  // One ticket item is one date; a multi-date listing would need one per session.
  return getEventSessions(event).length <= 1;
}

function cleanPrice(v) {
  const n = Number(String(v ?? "").trim().replace(/[$,]/g, ""));
  if (!Number.isFinite(n) || n <= 0) throw new Error("Enter a ticket price, like 15.");
  return Math.round(n * 100) / 100;
}

function cleanCapacity(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number.parseInt(s, 10);
  if (!Number.isInteger(n) || n <= 0 || n > 5000) throw new Error("Spots should be a whole number, or blank for no limit.");
  return n;
}

function getEvent(id) {
  return db.prepare("SELECT * FROM events WHERE id = ?").get(id) || null;
}

function ticketName(event) {
  const when = event.date ? new Date(event.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
  return `Ticket · ${event.title || "Event"}${when ? ` · ${when}` : ""}`.slice(0, 255);
}

/**
 * Put an event's tickets on sale: create the taxed Square item (once), stock it
 * with the number of spots, and open online sales. Refused outright if Square
 * has no sales tax switched on — the whole point is that tax is collected.
 */
export async function openTicketSales(eventId, { price, capacity }) {
  const event = getEvent(eventId);
  if (!canSellTickets(event)) throw new Error("Only The Alley's own events sell tickets here — a renter or tenant handles their own.");
  const p = cleanPrice(price);
  const cap = cleanCapacity(capacity);
  // A ticket item made while Square wasn't connected doesn't exist in Square.
  if (event.square_ticket_variation_id && !realId(event.square_ticket_variation_id)) {
    db.prepare("UPDATE events SET square_ticket_item_id = NULL, square_ticket_variation_id = NULL, ticket_capacity = NULL WHERE id = ?").run(event.id);
    event.square_ticket_variation_id = null;
    event.ticket_capacity = null;
  }

  if (!event.square_ticket_variation_id) {
    const categoryId = await ensureCategory("Event tickets", realId(getSetting("square_ticket_category_id", "")) || null);
    if (categoryId !== getSetting("square_ticket_category_id", "")) setSetting("square_ticket_category_id", categoryId);
    const created = await createCatalogItem({
      name: ticketName(event),
      price: p,
      categoryId,
      description: "Admission — sales tax applies.",
      trackInventory: cap != null,
      idempotencyKey: `alley-ticket-item-${event.id}`,
    });
    db.prepare("UPDATE events SET square_ticket_item_id = ?, square_ticket_variation_id = ? WHERE id = ?").run(
      created.itemId,
      created.variationId,
      event.id
    );
    if (cap != null) await addStock([{ variationId: created.variationId, qty: cap }], { idempotencyKey: `alley-tickets-${event.id}` });
  } else if (event.ticket_capacity == null && cap != null && !event.ticket_sales_open && ticketsSold(event) === 0) {
    // The item was made but its spots never went on (Square failed part-way
    // through the first try). Add them now — unless Square has them after all.
    if (Number(event.ticket_price) !== p) await updateVariationPrice(event.square_ticket_variation_id, p);
    const { counts } = await fetchCounts([event.square_ticket_variation_id]);
    if (!counts[event.square_ticket_variation_id]) {
      await addStock([{ variationId: event.square_ticket_variation_id, qty: cap }], { idempotencyKey: `alley-tickets-${event.id}-${Date.now()}` });
    }
  } else {
    if (Number(event.ticket_price) !== p) await updateVariationPrice(event.square_ticket_variation_id, p);
    // More spots = more stock. (Fewer, or switching a limit on/off, is done in
    // Square directly — taking stock away here could undercut sales already made.)
    if (cap != null && event.ticket_capacity != null && cap > event.ticket_capacity) {
      await addStock([{ variationId: event.square_ticket_variation_id, qty: cap - event.ticket_capacity }], {
        idempotencyKey: `alley-tickets-${event.id}-${cap}`,
      });
    } else if (cap !== event.ticket_capacity && !(cap == null && event.ticket_capacity == null)) {
      if (cap == null || event.ticket_capacity == null || cap < event.ticket_capacity) {
        throw new Error("Spots can only go up from here. To lower the limit or remove it, change the ticket's stock in Square.");
      }
    }
  }
  db.prepare("UPDATE events SET ticket_price = ?, ticket_capacity = ?, ticket_sales_open = 1 WHERE id = ?").run(
    p,
    event.square_ticket_variation_id ? (cap ?? event.ticket_capacity) : cap,
    event.id
  );
  return getEvent(event.id);
}

/** Stop (or restart) ONLINE sales. The item stays in Square for door sales. */
export function setTicketSalesOpen(eventId, open) {
  db.prepare("UPDATE events SET ticket_sales_open = ? WHERE id = ?").run(open ? 1 : 0, eventId);
}

/** Tickets sold so far, from synced Square sales (returns net out). */
export function ticketsSold(event) {
  if (!event?.square_ticket_variation_id) return 0;
  return (
    db
      .prepare("SELECT COALESCE(SUM(qty), 0) AS n FROM retail_sales WHERE kind = 'ticket' AND catalog_object_id = ?")
      .get(event.square_ticket_variation_id).n || 0
  );
}

/**
 * Spots left right now, read live from Square's count (it drops the moment a
 * ticket sells, online or at the door). null = no limit, or not knowable.
 */
export async function ticketsLeft(event) {
  if (!event?.square_ticket_variation_id || event.ticket_capacity == null) return null;
  if (!isSquareConfigured() || String(event.square_ticket_variation_id).startsWith("SIM-")) {
    return Math.max(0, event.ticket_capacity - ticketsSold(event));
  }
  const { counts } = await fetchCounts([event.square_ticket_variation_id]);
  const n = counts[event.square_ticket_variation_id];
  return n == null ? null : Math.max(0, n);
}

/**
 * Start one buyer's purchase: check spots, then hand back a Square checkout URL
 * for `qty` tickets with sales tax added. Never trusts a price from the browser —
 * Square prices it from the catalog item.
 */
export async function startTicketCheckout(eventId, qty, { appUrl }) {
  const event = getEvent(eventId);
  if (!canSellTickets(event) || !event.ticket_sales_open || !event.square_ticket_variation_id || event.status !== "live") {
    throw new Error("Tickets for this event aren't on sale online.");
  }
  const n = Number.parseInt(qty, 10);
  if (!Number.isInteger(n) || n < 1 || n > MAX_PER_ORDER) throw new Error(`Pick between 1 and ${MAX_PER_ORDER} tickets.`);
  const left = await ticketsLeft(event);
  if (left != null && n > left) {
    throw new Error(left ? `Only ${left} ticket${left === 1 ? "" : "s"} left.` : "Sorry — this event is sold out.");
  }
  return createTicketCheckout({
    variationId: event.square_ticket_variation_id,
    qty: n,
    redirectUrl: `${appUrl}/events/${event.id}?bought=1`,
    note: event.title || undefined,
  });
}

export { salesTaxes };

"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { setEventStatus, updateEvent, deleteEvent, createOwnEvent, createHostInvite, getEvent } from "@/lib/catalog.js";
import { emailHostInvite, emailHostReminder } from "@/lib/email.js";
import { logActivity, logEmail } from "@/lib/activity.js";
import { getActor, requireAdmin, requireStaffManager } from "@/lib/auth.js";
import { openTicketSales, setTicketSalesOpen } from "@/lib/tickets.js";
import { venueToday } from "@/lib/constants.js";
import { db } from "@/lib/db.js";

/**
 * The listing actions on the Events page — the side panel for one listing
 * (?ev=<id>), plus "Add a special event" and "New Alley event" at the top. Each one
 * lands back on the Events page with that listing's panel still open, so a
 * change never loses your place.
 */

function refresh() {
  revalidatePath("/admin/events");
  revalidatePath("/admin");
  revalidatePath("/events");
  revalidatePath("/calendar");
  revalidatePath("/");
}

/** Back to the Events page with this listing open and a message. */
function backToListing(id, message, type = "success") {
  const p = new URLSearchParams();
  if (id) p.set("ev", String(id));
  if (message) {
    p.set("toast", message);
    p.set("toastType", type);
  }
  redirect(`/admin/events?${p}`);
}

function parseLinksField(formData) {
  try {
    const l = JSON.parse(formData.get("links") || "[]");
    return Array.isArray(l) ? l : [];
  } catch {
    return [];
  }
}

/** Uploaded PDF paths, posted by EventMediaField as a JSON array. */
function parsePdfsField(formData) {
  try {
    const p = JSON.parse(formData.get("pdf_paths") || "[]");
    return Array.isArray(p) ? p.filter((x) => typeof x === "string" && x) : [];
  } catch {
    return [];
  }
}

// A special event: someone else's event that isn't a room rental. Minimal
// details now; the host fills in the rest through their private link.
export async function inviteHost(formData) {
  await requireAdmin();
  const host_name = (formData.get("host_name") || "").toString().trim();
  const host_email = (formData.get("host_email") || "").toString().trim();
  if (!host_name) backToListing(null, "Add the host's name.", "error");
  const { id, token } = createHostInvite({
    host_name,
    host_email,
    title: (formData.get("title") || "").toString().trim(),
    date: (formData.get("date") || "").toString().trim(),
    active_until: (formData.get("active_until") || "").toString().trim(),
  });
  if (host_email) {
    try {
      await emailHostInvite({ client_name: host_name, client_email: host_email }, token);
    } catch (err) {
      console.error("[events] host invite email error:", err.message);
    }
  }
  refresh();
  backToListing(
    id,
    host_email ? "Special event added — we emailed them their link." : "Special event added. No email entered — copy their link below and send it yourself.",
    host_email ? "success" : "error"
  );
}

// Re-send a host's invite link.
export async function emailHostLink(formData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const ev = getEvent(id);
  if (ev?.host_email && ev?.host_token) {
    try {
      await emailHostInvite({ client_name: ev.host_name, client_email: ev.host_email }, ev.host_token);
    } catch (err) {
      console.error("[events] host invite email error:", err.message);
    }
  }
  refresh();
  backToListing(
    id,
    ev?.host_email ? `Link emailed to ${ev.host_email}.` : "No host email on file — copy the link and send it yourself.",
    ev?.host_email ? "success" : "error"
  );
}

// Nudge a host whose listing is live as a placeholder but still empty.
export async function remindHost(formData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const ev = getEvent(id);
  let ok = false;
  if (ev?.host_email && ev?.host_token) {
    try {
      const res = await emailHostReminder(ev);
      // Reset the auto-reminder clock so the cron doesn't double-nudge within
      // its ~3-day window right after a manual reminder.
      db.prepare("UPDATE events SET host_reminder_last_sent = ? WHERE id = ?").run(venueToday(), id);
      logEmail({
        bookingId: ev.booking_id || null,
        eventType: "host_reminder_sent",
        description: `Host-details reminder sent${ev.title ? ` · ${ev.title}` : ""}`,
        recipientEmail: ev.host_email,
        sendResult: res,
        ...(await getActor()),
      });
      ok = true;
    } catch (err) {
      console.error("[events] host reminder email error:", err.message);
    }
  }
  refresh();
  backToListing(
    id,
    ok
      ? `Reminder sent to ${ev.host_email}.`
      : ev?.host_token
        ? "No host email on file — copy their link and send it yourself."
        : "Couldn't send the reminder.",
    ok ? "success" : "neutral"
  );
}

export async function approveEvent(formData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const ev = setEventStatus(id, "live", { actor: await getActor(), via: "approved on Events" });
  refresh();
  backToListing(id, `“${ev?.title || "Event"}” is on the public calendar.`);
}

// Show / hide a listing on the public calendar. 'private' (not 'pending') so a
// hidden listing never reads as waiting on a decision; every public surface
// filters on status = 'live', and nothing the host wrote is lost.
export async function setEventPublic(formData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const makePublic = formData.get("public") === "1";
  const ev = setEventStatus(id, makePublic ? "live" : "private", { actor: await getActor(), via: "Events" });
  refresh();
  backToListing(
    id,
    makePublic
      ? `“${ev?.title || "Event"}” is on the public calendar.`
      : `“${ev?.title || "Event"}” is hidden from the public calendar.`,
    makePublic ? "success" : "neutral"
  );
}

export async function removeEvent(formData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const ev = getEvent(id);
  deleteEvent(id);
  refresh();
  backToListing(null, `Removed “${ev?.title || ev?.host_name || "the listing"}”.`, "neutral");
}

export async function saveEvent(formData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  updateEvent(id, {
    title: formData.get("title"),
    host_name: formData.get("host_name"),
    description: formData.get("description"),
    date: formData.get("date"),
    time: formData.get("time"),
    // Guest-facing times; blank clears back to the reservation time.
    public_time: (formData.get("public_time") || "").toString(),
    public_end_time: (formData.get("public_end_time") || "").toString(),
    tickets: formData.get("tickets") || null,
    price: formData.get("price"),
    payment_instructions: formData.get("payment_instructions"),
    payment_link: formData.get("payment_link"),
    links: parseLinksField(formData),
    // "" is an explicit "remove the photo", not "leave it alone".
    photo_path: (formData.get("photo_path") ?? "").toString(),
    pdf_paths: parsePdfsField(formData),
  });
  refresh();
  backToListing(id, "Saved.");
}

export async function createEvent(formData) {
  await requireAdmin();
  const created = createOwnEvent({
    title: formData.get("title"),
    host_name: formData.get("host_name") || "The Alley On Center",
    description: formData.get("description"),
    date: formData.get("date"),
    time: formData.get("time"),
    public_time: (formData.get("public_time") || "").toString(),
    public_end_time: (formData.get("public_end_time") || "").toString(),
    space: formData.get("space") || null,
    tickets: formData.get("tickets") || null,
    price: formData.get("price"),
    payment_instructions: formData.get("payment_instructions"),
    payment_link: formData.get("payment_link"),
    photo_path: (formData.get("photo_path") || "").toString() || null,
    pdf_paths: parsePdfsField(formData),
    links: parseLinksField(formData),
    status: "live",
  });
  refresh();
  // Opens the new listing's panel — a real navigation, so the form behind it
  // resets and pressing Publish again can't make a second copy.
  backToListing(created.id, `“${created.title || "Event"}” is live on the calendar.`);
}

export async function openTickets(formData) {
  await requireStaffManager();
  const id = Number(formData.get("id"));
  let ev;
  try {
    ev = await openTicketSales(id, { price: formData.get("ticket_price"), capacity: formData.get("ticket_capacity") });
  } catch (err) {
    backToListing(id, err.message, "error");
  }
  logActivity({
    eventType: "tickets_opened",
    description: `Tickets on sale for "${ev.title}" at $${Number(ev.ticket_price).toFixed(2)} + sales tax${ev.ticket_capacity ? ` · ${ev.ticket_capacity} spots` : ""}`,
    ...(await getActor()),
  });
  revalidatePath("/admin/events");
  revalidatePath(`/events/${id}`);
  backToListing(id, "Tickets are on sale — sales tax is added at checkout and at the register.");
}

export async function toggleTickets(formData) {
  await requireStaffManager();
  const id = Number(formData.get("id"));
  const open = formData.get("open") === "1";
  setTicketSalesOpen(id, open);
  logActivity({
    eventType: open ? "tickets_opened" : "tickets_closed",
    description: `Online ticket sales ${open ? "reopened" : "stopped"} for event #${id}`,
    ...(await getActor()),
  });
  revalidatePath("/admin/events");
  revalidatePath(`/events/${id}`);
  backToListing(id, open ? "Online sales reopened." : "Online sales stopped — door sales still work at the register.", "neutral");
}

/**
 * One section of a listing from the side panel (Details, When, Tickets &
 * payment, Links, Photo & PDFs). Saves only that section's fields and returns
 * { error } (the section stays open) or { ok } — the panel stays put.
 */
export async function saveListingSection(formData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  if (!getEvent(id)) return { error: "That listing is gone — reload the page." };
  const str = (k) => (formData.get(k) ?? "").toString().trim();
  let data;
  switch (formData.get("section")) {
    case "details":
      if (!str("title")) return { error: "Give it a title." };
      data = { title: str("title"), host_name: str("host_name"), description: (formData.get("description") || "").toString() };
      break;
    case "when":
      if (!str("date")) return { error: "It needs a date." };
      // Guest-facing times; blank clears back to the reservation time.
      data = { date: str("date"), time: str("time"), public_time: str("public_time"), public_end_time: str("public_end_time") };
      break;
    case "pay":
      if (str("tickets") && !/^\d+$/.test(str("tickets"))) return { error: "Spots should be a whole number." };
      data = {
        tickets: str("tickets") || null,
        price: str("price"),
        payment_instructions: str("payment_instructions"),
        payment_link: str("payment_link"),
      };
      break;
    case "links":
      data = { links: parseLinksField(formData) };
      break;
    case "media":
      // "" is an explicit "remove the photo", not "leave it alone".
      data = { photo_path: str("photo_path"), pdf_paths: parsePdfsField(formData) };
      break;
    default:
      return { error: "Nothing to save." };
  }
  updateEvent(id, data);
  refresh();
  revalidatePath(`/events/${id}`);
  return { ok: true };
}

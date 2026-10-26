"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createExhibitor, updateExhibitor, deleteExhibitor, getExhibitor, ensureExhibitorToken } from "@/lib/catalog.js";
import { setAgreementEnds, linkExhibitorToMaker, makerForExhibitor } from "@/lib/agreement-reminders.js";
import { emailExhibitorInvite } from "@/lib/email.js";
import { requireAdmin, getActor } from "@/lib/auth.js";
import { startSellingArtist } from "@/lib/inventory.js";
import { logActivity } from "@/lib/activity.js";

/**
 * Exhibitor actions. The section editors on an artist's page each save only
 * their own fields and return { error } (the form stays open) or { ok }.
 */

function refresh(id) {
  revalidatePath("/exhibitors");
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/exhibitors");
  if (id) revalidatePath(`/admin/exhibitors/${id}`);
}

const str = (fd, k) => (fd.get(k) || "").toString().trim();

/** Save some of an artist's owner-set fields, keeping the rest as they are. */
function patch(id, changes) {
  const e = getExhibitor(id);
  if (!e) return { error: "That exhibitor is gone — reload the page." };
  updateExhibitor(id, { ...e, active: Number(e.active) === 1, ...changes });
  return { ok: true };
}

export async function addExhibitor(formData) {
  await requireAdmin();
  const name = str(formData, "name");
  if (!name) redirect("/admin/exhibitors?toast=" + encodeURIComponent("Give them a name.") + "&toastType=error");
  const until = str(formData, "active_until");
  const id = createExhibitor({ name, contact_email: str(formData, "contact_email"), active: true, active_until: until });
  ensureExhibitorToken(id);
  if (until) setAgreementEnds("artist", id, until);
  refresh(id);
  redirect(`/admin/exhibitors/${id}?toast=${encodeURIComponent(`${name} added.`)}&toastType=success`);
}

export async function saveArtist(formData) {
  await requireAdmin();
  const name = str(formData, "name");
  if (!name) return { error: "They need a name." };
  const email = str(formData, "contact_email");
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "That email doesn't look right." };
  const id = Number(formData.get("id"));
  const res = patch(id, { name, contact_email: email });
  refresh(id);
  return res;
}

export async function saveOnView(formData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const from = str(formData, "active_from");
  const until = str(formData, "active_until");
  if (from && until && until < from) return { error: "The end date is before the start date." };
  const res = patch(id, { active: formData.get("active") != null, active_from: from, active_until: until, sort_order: str(formData, "sort_order") });
  if (res.error) return res;
  // Same person, same date: a linked maker's agreement moves with it.
  setAgreementEnds("artist", id, until);
  refresh(id);
  return res;
}

export async function saveShop(formData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const e = getExhibitor(id);
  if (!e) return { error: "That exhibitor is gone — reload the page." };
  linkExhibitorToMaker(id, Number(formData.get("vendor_id")) || null);
  // One agreement, one date: theirs goes to the maker, or the maker's comes here.
  const date = e.active_until || makerForExhibitor(getExhibitor(id))?.agreement_ends;
  if (date) setAgreementEnds("artist", id, date);
  revalidatePath("/admin/vendors");
  refresh(id);
  return { ok: true };
}

/**
 * Their work is for sale in the shop: give them a maker record (drop-offs,
 * tags, the register, sales and payouts), linked to this listing.
 */
export async function startSelling(formData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  let vendor;
  try {
    vendor = startSellingArtist(id);
  } catch (err) {
    redirect(`/admin/exhibitors/${id}?toast=${encodeURIComponent(err.message)}&toastType=error`);
  }
  const e = getExhibitor(id);
  // One agreement, one date, as when they're linked by hand.
  const date = e.active_until || vendor.agreement_ends;
  if (date) setAgreementEnds("artist", id, date);
  logActivity({ eventType: "vendor_added", description: `Started selling ${e.name}'s art in the shop`, ...(await getActor()) });
  revalidatePath("/admin/vendors");
  refresh(id);
  redirect(
    `/admin/exhibitors/${id}?toast=${encodeURIComponent(`Ready. ${e.name} can list art for sale on their private link.`)}&toastType=success#selling`
  );
}

export async function makeLink(formData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  ensureExhibitorToken(id);
  refresh(id);
  redirect(`/admin/exhibitors/${id}`);
}

export async function emailLink(formData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const token = ensureExhibitorToken(id);
  const ex = getExhibitor(id);
  if (!ex?.contact_email) {
    redirect(`/admin/exhibitors/${id}?toast=${encodeURIComponent("Add their email first (Artist → Edit).")}&toastType=error`);
  }
  let ok = true;
  try {
    const res = await emailExhibitorInvite(ex, token);
    if (res?.ok === false) ok = false;
  } catch (err) {
    console.error("[exhibitors] invite email error:", err.message);
    ok = false;
  }
  redirect(
    `/admin/exhibitors/${id}?toast=${encodeURIComponent(
      ok ? `Link emailed to ${ex.contact_email}.` : "The email didn't send. Copy the link and text it instead."
    )}&toastType=${ok ? "success" : "error"}`
  );
}

export async function removeExhibitor(formData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const name = getExhibitor(id)?.name || "The exhibitor";
  deleteExhibitor(id);
  refresh();
  redirect("/admin/exhibitors?toast=" + encodeURIComponent(`${name} removed.`) + "&toastType=success");
}

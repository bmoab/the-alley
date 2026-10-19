"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireStaffManager, getActor, getCurrentUser, canManageStaff } from "@/lib/auth.js";
import {
  getVendor,
  createVendor,
  updateVendor,
  setVendorActive,
  ensureVendorToken,
  rotateVendorToken,
  saveTerms,
} from "@/lib/inventory.js";
import { setAgreementEnds } from "@/lib/agreement-reminders.js";
import { logActivity } from "@/lib/activity.js";

/**
 * Makers actions. The section editors on a maker's page each save only their
 * own fields (updateVendor keeps any field passed as undefined) and return
 * { error } (the form stays open) or { ok }.
 */

function refresh(id) {
  revalidatePath("/admin/vendors");
  revalidatePath("/admin");
  revalidatePath("/admin/exhibitors");
  if (id) revalidatePath(`/admin/vendors/${id}`);
}

function back(id, message, type = "success", hash = "") {
  refresh(id);
  redirect(`/admin/vendors/${id}?toast=${encodeURIComponent(message)}&toastType=${type}${hash}`);
}

const str = (fd, k) => (fd.get(k) || "").toString().trim();

export async function addVendor(formData) {
  await requireAdmin();
  const manager = canManageStaff(await getCurrentUser());
  let v;
  try {
    v = createVendor({
      name: formData.get("name"),
      contact_name: formData.get("contact_name"),
      email: formData.get("email"),
      phone: formData.get("phone"),
      // A share other than the usual is an owner/admin call.
      default_split: manager ? formData.get("default_split") : undefined,
      payout_method: formData.get("payout_method"),
      notes: formData.get("notes"),
    });
  } catch (err) {
    redirect(`/admin/vendors?toast=${encodeURIComponent(err.message)}&toastType=error`);
  }
  logActivity({ eventType: "vendor_added", description: `Added maker ${v.name}`, ...(await getActor()) });
  refresh();
  redirect(`/admin/vendors/${v.id}?toast=${encodeURIComponent(`${v.name} added.`)}&toastType=success`);
}

export async function updateTerms(formData) {
  await requireStaffManager();
  try {
    saveTerms({ text: formData.get("terms"), days: formData.get("days") });
  } catch (err) {
    redirect(`/admin/vendors?toast=${encodeURIComponent(err.message)}&toastType=error#terms`);
  }
  logActivity({ eventType: "consignment_terms_updated", description: "Updated the consignment terms", ...(await getActor()) });
  revalidatePath("/admin/vendors");
  redirect(`/admin/vendors?toast=${encodeURIComponent("Terms saved. Makers will be asked to agree to the new version.")}&toastType=success`);
}

/** Save one section's fields, keeping everything else as it is. */
async function patch(id, fields) {
  if (!getVendor(id)) return { error: "That maker is gone — reload the page." };
  let v;
  try {
    v = updateVendor(id, fields);
  } catch (err) {
    return { error: err.message };
  }
  logActivity({ eventType: "vendor_updated", description: `Updated ${v.name}`, ...(await getActor()) });
  refresh(id);
  return { ok: true };
}

export async function saveMaker(formData) {
  await requireAdmin();
  if (!str(formData, "name")) return { error: "The maker needs a name." };
  return patch(Number(formData.get("id")), {
    name: formData.get("name"),
    contact_name: formData.get("contact_name"),
    phone: formData.get("phone"),
    notes: formData.get("notes"),
  });
}

/** Their share, the email their account matches on and where their money goes: owner/admin only. */
export async function saveMoney(formData) {
  await requireStaffManager();
  const email = str(formData, "email");
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "That email doesn't look right." };
  return patch(Number(formData.get("id")), {
    default_split: formData.get("default_split"),
    payout_method: formData.get("payout_method"),
    email,
  });
}

export async function saveAgreement(formData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const v = getVendor(id);
  if (!v) return { error: "That maker is gone — reload the page." };
  try {
    // Also moves the date on their gallery listing, if they have one.
    setAgreementEnds("maker", id, str(formData, "agreement_ends"));
  } catch (err) {
    return { error: err.message };
  }
  logActivity({ eventType: "vendor_updated", description: `Updated ${v.name}'s agreement end date`, ...(await getActor()) });
  refresh(id);
  return { ok: true };
}

export async function toggleVendor(formData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const active = formData.get("active") === "1";
  setVendorActive(id, active);
  back(id, active ? "Reactivated." : "Marked inactive — they're hidden from Receive stock.", "neutral");
}

export async function makeLink(formData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  ensureVendorToken(id);
  back(id, "Private link made — copy it below.", "success", "#access");
}

/** A forwarded or leaked private link: replace it, and the old one stops working. */
export async function newLink(formData) {
  await requireStaffManager();
  const id = Number(formData.get("id"));
  rotateVendorToken(id);
  logActivity({ eventType: "vendor_updated", description: `Replaced the private link for maker #${id}`, ...(await getActor()) });
  back(id, "New private link made — the old one no longer works.", "success", "#access");
}

"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createDirectoryEntry,
  updateDirectoryEntry,
  deleteDirectoryEntry,
  getSuite,
  getDirectoryEntry,
  ensureDirectoryToken,
  setTenantSuites,
  updateSuiteInfo,
} from "@/lib/catalog.js";
import { emailTenantInvite } from "@/lib/email.js";
import { requireAdmin } from "@/lib/auth.js";
import { setTenantRent } from "@/lib/staff-costs.js";

/**
 * Directory actions. The section editors on a tenant's page each save only
 * their own fields and return { error } (the form stays open) or { ok }.
 */

function refresh(id) {
  revalidatePath("/directory");
  revalidatePath("/");
  revalidatePath("/admin/directory");
  if (id) revalidatePath(`/admin/directory/${id}`);
}

const str = (fd, k) => (fd.get(k) || "").toString().trim();

/** Save some of a tenant's owner-set fields, keeping the rest as they are. */
function patch(id, changes) {
  const e = getDirectoryEntry(id);
  if (!e) return { error: "That business is gone — reload the page." };
  updateDirectoryEntry(id, { ...e, active: Number(e.active) === 1, ...changes });
  refresh(id);
  return { ok: true };
}

export async function addTenant(formData) {
  await requireAdmin();
  const name = str(formData, "business_name");
  if (!name) redirect("/admin/directory?toast=" + encodeURIComponent("Give the business a name.") + "&toastType=error");
  const id = createDirectoryEntry({ business_name: name, contact_email: str(formData, "contact_email"), active: true });
  ensureDirectoryToken(id);
  refresh(id);
  redirect(`/admin/directory/${id}?toast=${encodeURIComponent(`${name} added.`)}&toastType=success`);
}

export async function saveBusiness(formData) {
  await requireAdmin();
  const name = str(formData, "business_name");
  if (!name) return { error: "The business needs a name." };
  const email = str(formData, "contact_email");
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "That email doesn't look right." };
  return patch(Number(formData.get("id")), { business_name: name, contact_email: email });
}

export async function saveVisibility(formData) {
  await requireAdmin();
  const from = str(formData, "active_from");
  const until = str(formData, "active_until");
  if (from && until && until < from) return { error: "The end date is before the start date." };
  return patch(Number(formData.get("id")), { active: formData.get("active") != null, active_from: from, active_until: until });
}

export async function saveSuites(formData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  if (!getDirectoryEntry(id)) return { error: "That business is gone — reload the page." };
  setTenantSuites(id, formData.getAll("suite_ids"));
  refresh(id);
  return { ok: true };
}

export async function saveRent(formData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  try {
    setTenantRent(id, { amount: formData.get("rent_amount"), link: formData.get("rent_link") });
  } catch (err) {
    return { error: err.message };
  }
  refresh(id);
  return { ok: true };
}

export async function makeLink(formData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  ensureDirectoryToken(id);
  refresh(id);
  redirect(`/admin/directory/${id}`);
}

export async function emailLink(formData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const token = ensureDirectoryToken(id);
  const entry = getDirectoryEntry(id);
  if (!entry?.contact_email) {
    redirect(`/admin/directory/${id}?toast=${encodeURIComponent("Add their email first (Business → Edit).")}&toastType=error`);
  }
  let ok = true;
  try {
    const res = await emailTenantInvite(entry, token);
    if (res?.ok === false) ok = false;
  } catch (err) {
    console.error("[directory] tenant invite email error:", err.message);
    ok = false;
  }
  redirect(
    `/admin/directory/${id}?toast=${encodeURIComponent(
      ok ? `Link emailed to ${entry.contact_email}.` : "The email didn't send. Copy the link and text it instead."
    )}&toastType=${ok ? "success" : "error"}`
  );
}

export async function removeTenant(formData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const name = getDirectoryEntry(id)?.business_name || "The business";
  setTenantSuites(id, []); // free its suites
  deleteDirectoryEntry(id);
  refresh();
  redirect("/admin/directory?toast=" + encodeURIComponent(`${name} removed.`) + "&toastType=success");
}

export async function saveSuite(formData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const s = getSuite(id);
  if (!s) return { error: "That suite is gone — reload the page." };
  // An occupied suite only has its name edited here; keep its listing as is.
  if (formData.get("occupied")) {
    updateSuiteInfo(id, { name: str(formData, "name"), available: Number(s.available) === 1, vacant_blurb: s.vacant_blurb });
    refresh();
    return { ok: true };
  }
  updateSuiteInfo(id, {
    name: str(formData, "name"),
    available: formData.get("available") != null,
    vacant_photo: str(formData, "vacant_photo"), // "" clears it
    vacant_blurb: str(formData, "vacant_blurb"),
  });
  refresh();
  return { ok: true };
}

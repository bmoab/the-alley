"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccount, makerForAccount } from "@/lib/accounts.js";
import {
  getVendorByToken,
  acceptTerms,
  submitDropoff,
  cancelDropoff,
  updateVendor,
} from "@/lib/inventory.js";
import { logActivity } from "@/lib/activity.js";

/**
 * Who's acting, from the form: a maker's private link (token) or a signed-in
 * account whose email matches the maker's. Every action starts here — the
 * hidden fields are only a pointer, never trusted on their own.
 */
async function resolveMaker(formData) {
  const token = (formData.get("token") || "").toString();
  if (token) {
    const vendor = getVendorByToken(token);
    return vendor ? { vendor, back: `/maker/${token}`, by: `${vendor.name} (private link)` } : null;
  }
  const account = await getAccount();
  const vendor = makerForAccount(account, formData.get("vendor_id"));
  return vendor ? { vendor, back: `/account/consign/${vendor.id}`, by: account.name || account.email } : null;
}

function go(back, message, type = "success", hash = "") {
  revalidatePath(back);
  redirect(`${back}?toast=${encodeURIComponent(message)}&toastType=${type}${hash}`);
}

export async function agreeToTerms(formData) {
  const who = await resolveMaker(formData);
  if (!who) redirect("/account/sign-in");
  try {
    acceptTerms(who.vendor.id, formData.get("signed_name"));
  } catch (err) {
    go(who.back, err.message, "error", "#terms");
  }
  logActivity({ eventType: "maker_terms_accepted", description: `${who.vendor.name} agreed to the consignment terms`, actorName: who.by });
  go(who.back, "Thanks — you're all set to list a drop-off.");
}

/** useFormState: returns { error } so the typed rows stay put; redirects on success. */
export async function sendDropoff(_prev, formData) {
  const who = await resolveMaker(formData);
  if (!who) return { error: "Your session ended — sign in again." };
  let id;
  try {
    const lines = JSON.parse((formData.get("lines") || "[]").toString());
    id = submitDropoff(who.vendor.id, { lines, notes: formData.get("notes"), by: who.by });
  } catch (err) {
    return { error: err instanceof SyntaxError ? "Couldn't read the rows — try again." : err.message };
  }
  logActivity({
    eventType: "dropoff_submitted",
    description: `${who.vendor.name} listed a drop-off (#${id})`,
    metadata: { dropoffId: id },
    actorName: who.by,
  });
  revalidatePath("/admin/inventory/dropoffs");
  go(who.back, "Sent! Bring it in whenever suits — we'll count it with you.", "success", "#dropoffs");
}

export async function withdrawDropoff(formData) {
  const who = await resolveMaker(formData);
  if (!who) redirect("/account/sign-in");
  try {
    cancelDropoff(who.vendor.id, Number(formData.get("id")));
  } catch (err) {
    go(who.back, err.message, "error", "#dropoffs");
  }
  revalidatePath("/admin/inventory/dropoffs");
  go(who.back, "Drop-off cancelled.", "neutral", "#dropoffs");
}

export async function saveMakerDetails(formData) {
  const who = await resolveMaker(formData);
  if (!who) redirect("/account/sign-in");
  // A maker can change how they're reached and paid — not their email (that's
  // what links them to an account) and not their split.
  updateVendor(who.vendor.id, {
    contact_name: formData.get("contact_name"),
    phone: formData.get("phone"),
    payout_method: formData.get("payout_method"),
  });
  logActivity({ eventType: "vendor_updated", description: `${who.vendor.name} updated their contact / payout details`, actorName: who.by });
  go(who.back, "Saved.", "success", "#details");
}

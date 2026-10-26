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
  saveItemSetup,
  groupByName,
} from "@/lib/inventory.js";
import { logActivity } from "@/lib/activity.js";
import { getExhibitorByToken } from "@/lib/catalog.js";
import { makerForExhibitor } from "@/lib/agreement-reminders.js";
import { confirmIntake } from "@/lib/vendor-record.js";

/**
 * Who's acting, from the form: a maker's private link (token) or a signed-in
 * account whose email matches the maker's. Every action starts here — the
 * hidden fields are only a pointer, never trusted on their own.
 */
async function resolveMaker(formData) {
  // A gallery artist on their exhibitor link, acting as their maker record.
  const artistToken = (formData.get("artist") || "").toString();
  if (artistToken) {
    const ex = getExhibitorByToken(artistToken);
    const vendor = ex ? makerForExhibitor(ex) : null;
    return vendor?.is_active
      ? { vendor, back: `/exhibitor/${artistToken}?tab=sales`, by: `${ex.name} (private link)` }
      : null;
  }
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
  revalidatePath(back.split("?")[0]);
  redirect(`${back}${back.includes("?") ? "&" : "?"}toast=${encodeURIComponent(message)}&toastType=${type}${hash}`);
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
  }, { by: who.by });
  logActivity({ eventType: "vendor_updated", description: `${who.vendor.name} updated their contact / payout details`, actorName: who.by });
  go(who.back, "Saved.", "success", "#details");
}

/** Their groups and costs (both optional; costs are private to them). */
export async function saveItems(formData) {
  const who = await resolveMaker(formData);
  if (!who) redirect("/account/sign-in");
  try {
    const rows = JSON.parse((formData.get("rows") || "[]").toString());
    saveItemSetup(who.vendor.id, rows, { withCost: true });
  } catch (err) {
    go(who.back, err instanceof SyntaxError ? "Couldn't read that — try again." : err.message, "error", "#setup");
  }
  go(who.back, "Saved.", "success", "#selling");
}

export async function sortItemsByName(formData) {
  const who = await resolveMaker(formData);
  if (!who) redirect("/account/sign-in");
  const n = groupByName(who.vendor.id);
  go(who.back, n ? `Sorted ${n} items into groups.` : "Nothing to sort.", n ? "success" : "neutral", "#setup");
}

/** They checked a stock sheet against what they brought in, and it's right. */
export async function confirmSheet(formData) {
  const who = await resolveMaker(formData);
  if (!who) redirect("/account/sign-in");
  const id = Number(formData.get("intake"));
  try {
    confirmIntake(who.vendor.id, id, formData.get("confirmed_name"));
  } catch (err) {
    go(who.back, err.message, "error", `#sheet-${id}`);
  }
  logActivity({ eventType: "stock_confirmed", description: `${who.vendor.name} confirmed stock sheet #${id}`, actorName: who.by });
  go(who.back, "Thanks — confirmed.", "success", "#record");
}

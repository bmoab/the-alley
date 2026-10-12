import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, getActor } from "@/lib/auth.js";
import {
  listVendors,
  listItems,
  createVendor,
  recordIntake,
  pushIntakeToSquare,
  defaultSplit,
  getDropoff,
} from "@/lib/inventory.js";
import { logActivity } from "@/lib/activity.js";
import { venueToday } from "@/lib/constants.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import ReceiveStockForm from "@/components/admin/ReceiveStockForm.js";

export const metadata = { title: "Receive stock" };
export const dynamic = "force-dynamic";

/**
 * Called through useFormState, so it gets (previousState, formData) and
 * RETURNS { error } to show in the form — the typed-in rows stay put. Success
 * redirects to the intake's receipt.
 */
async function receive(_prev, formData) {
  "use server";
  await requireAdmin();
  const actor = await getActor();
  let intakeId;
  let vendorName;
  try {
    let vendorId = (formData.get("vendor_id") || "").toString();
    if (vendorId === "new") {
      const v = createVendor({
        name: formData.get("new_vendor_name"),
        email: formData.get("new_vendor_email"),
        phone: formData.get("new_vendor_phone"),
        default_split: formData.get("new_vendor_split"),
      });
      logActivity({ eventType: "vendor_added", description: `Added maker ${v.name}`, ...actor });
      vendorId = v.id;
    }
    let lines = [];
    try {
      lines = JSON.parse((formData.get("lines") || "[]").toString());
    } catch {
      throw new Error("Couldn't read the item rows — try again.");
    }
    intakeId = recordIntake({
      dropoffId: Number(formData.get("dropoff_id")) || null,
      vendorId: Number(vendorId),
      receivedOn: (formData.get("received_on") || "").toString(),
      receivedBy: actor.actorName,
      signedName: formData.get("signed_name"),
      notes: formData.get("notes"),
      lines: Array.isArray(lines) ? lines : [],
    });
    vendorName = listVendors({ includeInactive: true }).find((v) => v.id === Number(vendorId))?.name;
  } catch (err) {
    return { error: err.message || "Couldn't save that." };
  }
  const push = await pushIntakeToSquare(intakeId);
  logActivity({
    eventType: "stock_received",
    description: `Received stock from ${vendorName || "a vendor"} (sheet #${intakeId})${push.ok ? "" : " — Square update failed, retry from the sheet"}`,
    metadata: { intakeId },
    ...actor,
  });
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/inventory/dropoffs");
  revalidatePath("/admin/vendors");
  redirect(
    `/admin/inventory/intake/${intakeId}?toast=${encodeURIComponent(
      push.ok ? "Received — it's in Square. Print the tags below." : "Saved here, but Square didn't take it. Retry below."
    )}&toastType=${push.ok ? "success" : "error"}`
  );
}

export default async function ReceivePage({ searchParams }) {
  await requireAdmin();
  const vendors = listVendors();
  const items = listItems({ status: "all" });
  const itemsByVendor = {};
  for (const i of items) {
    if (i.status === "archived") continue;
    (itemsByVendor[i.vendor_id] ||= []).push({
      id: i.id,
      name: i.name,
      sku: i.sku,
      price: i.price,
      split: i.split,
    });
  }
  const dropoff = searchParams?.dropoff ? getDropoff(Number(searchParams.dropoff)) : null;
  if (dropoff && dropoff.status !== "submitted") {
    redirect(`/admin/inventory/dropoffs?toast=${encodeURIComponent("That drop-off was already dealt with.")}&toastType=neutral`);
  }
  return (
    <div>
      <PageHeader
        title="Receive stock"
        subtitle="When a maker drops things off. This replaces the paper sheet — it puts everything into Square, taxed and with a barcode number, ready to ring up. (Things The Alley buys outright go straight into Square instead.)"
      />
      <p className="mb-4 text-sm">
        <Link href="/admin/inventory" className="font-semibold text-ink-muted hover:text-ink">
          ← Inventory
        </Link>
      </p>
      <ReceiveStockForm
        vendors={vendors.map((v) => ({ id: v.id, name: v.name, kind: v.kind, default_split: v.default_split }))}
        itemsByVendor={itemsByVendor}
        defaultSplit={defaultSplit()}
        today={venueToday()}
        receiveAction={receive}
        initialVendorId={searchParams?.vendor || ""}
        dropoff={dropoff}
      />
    </div>
  );
}

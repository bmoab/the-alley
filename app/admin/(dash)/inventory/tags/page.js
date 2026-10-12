import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin, getActor } from "@/lib/auth.js";
import { shopCatalog, giveBarcodes, createTagPrint, TAG_FORMATS, TAG_CODES } from "@/lib/inventory.js";
import { logActivity } from "@/lib/activity.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import Card from "@/components/admin/ui/Card.js";
import Button from "@/components/admin/ui/Button.js";
import TagPicker from "@/components/admin/TagPicker.js";

export const metadata = { title: "Price tags" };
export const dynamic = "force-dynamic";

async function makeTags(formData) {
  "use server";
  await requireAdmin();
  const actor = await getActor();
  let id;
  try {
    id = createTagPrint({
      format: formData.get("format"),
      code: formData.get("code"),
      startAt: formData.get("start_at"),
      items: JSON.parse((formData.get("items") || "[]").toString()),
      by: actor.actorName,
    });
  } catch (err) {
    redirect(`/admin/inventory/tags?toast=${encodeURIComponent(err.message)}&toastType=error`);
  }
  redirect(`/admin/print/tags/${id}`);
}

async function numberEverything() {
  "use server";
  await requireAdmin();
  let given;
  try {
    ({ given } = await giveBarcodes());
  } catch (err) {
    redirect(`/admin/inventory/tags?toast=${encodeURIComponent(`Square didn't take it: ${err.message}`)}&toastType=error`);
  }
  if (given) {
    logActivity({ eventType: "barcodes_given", description: `Gave ${given} item${given === 1 ? "" : "s"} in Square a barcode number`, ...(await getActor()) });
  }
  redirect(
    `/admin/inventory/tags?toast=${encodeURIComponent(given ? `${given} item${given === 1 ? "" : "s"} now have a barcode number.` : "Everything already has one.")}&toastType=success`
  );
}

export default async function TagsPage() {
  await requireAdmin();
  let catalog;
  let error = null;
  try {
    catalog = await shopCatalog();
  } catch (err) {
    error = err.message;
    catalog = { rows: [], simulated: false };
  }
  const missing = catalog.rows.filter((r) => !r.sku).length;

  return (
    <div>
      <PageHeader
        title="Price tags"
        subtitle="Tags with the price and a barcode, for anything in Square — makers' items and The Alley's own. Scan the tag at the register and the item rings up."
      />
      <p className="mb-4 text-sm">
        <Link href="/admin/inventory" className="font-semibold text-ink-muted hover:text-ink">← Inventory</Link>
      </p>
      {error ? (
        <p className="mb-4 rounded-lg border border-rust/30 bg-rust/10 px-3 py-2 text-sm text-rust">Couldn&apos;t read Square: {error}</p>
      ) : null}
      {catalog.simulated ? (
        <p className="mb-4 rounded-lg border border-line bg-paper-dim px-3 py-2 text-xs text-ink-muted">
          Square isn&apos;t connected on this copy of the site — only items received here are listed.
        </p>
      ) : null}

      {missing ? (
        <Card pad="md" className="mb-5 border-verde-deep/40">
          <p className="font-semibold text-ink">
            {missing} item{missing === 1 ? " has" : "s have"} no barcode number yet
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            Things added straight in Square usually don&apos;t. One click gives each a number (it&apos;s saved as the item&apos;s SKU in
            Square, which is what the register looks up when a tag is scanned). Items that already have one — like a
            manufacturer&apos;s barcode — are left alone.
          </p>
          <form action={numberEverything} className="mt-3">
            <Button type="submit" variant="accent">Give them barcode numbers</Button>
          </form>
        </Card>
      ) : null}

      <TagPicker rows={catalog.rows} formats={TAG_FORMATS} codes={TAG_CODES} action={makeTags} />
    </div>
  );
}

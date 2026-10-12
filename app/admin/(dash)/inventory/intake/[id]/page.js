import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin, getActor } from "@/lib/auth.js";
import { getIntake, pushIntakeToSquare, round2, createTagPrint, tagItemsForIntake } from "@/lib/inventory.js";
import TagFormatFields from "@/components/admin/TagFormatFields.js";
import { logActivity } from "@/lib/activity.js";
import { isSquareConfigured } from "@/lib/square.js";
import { formatDate, formatMoney } from "@/lib/constants.js";
import Badge from "@/components/admin/ui/Badge.js";
import Button from "@/components/admin/ui/Button.js";

export const metadata = { title: "Stock sheet" };
export const dynamic = "force-dynamic";

async function retry(formData) {
  "use server";
  await requireAdmin();
  const id = Number(formData.get("id"));
  const res = await pushIntakeToSquare(id);
  if (res.ok) logActivity({ eventType: "stock_received", description: `Sheet #${id} sent to Square on retry`, ...(await getActor()) });
  revalidatePath(`/admin/inventory/intake/${id}`);
  redirect(
    `/admin/inventory/intake/${id}?toast=${encodeURIComponent(res.ok ? "Sent to Square." : `Square still says: ${res.error}`)}&toastType=${res.ok ? "success" : "error"}`
  );
}

async function printTags(formData) {
  "use server";
  await requireAdmin();
  const id = Number(formData.get("id"));
  const actor = await getActor();
  let jobId;
  try {
    jobId = createTagPrint({
      format: formData.get("format"),
      code: formData.get("code"),
      startAt: formData.get("start_at"),
      items: tagItemsForIntake(id),
      by: actor.actorName,
    });
  } catch (err) {
    redirect(`/admin/inventory/intake/${id}?toast=${encodeURIComponent(err.message)}&toastType=error`);
  }
  redirect(`/admin/print/tags/${jobId}`);
}

/** One delivery, laid out like the paper sheet it replaces — printable for the maker's records. */
export default async function IntakePage({ params }) {
  await requireAdmin();
  const intake = getIntake(Number(params.id));
  if (!intake) notFound();
  const consigned = true;
  const units = intake.lines.reduce((t, l) => t + l.qty, 0);
  const value = round2(intake.lines.reduce((t, l) => t + l.qty * l.price, 0));
  const isReturn = intake.lines.some((l) => l.qty < 0);
  const simulated = !isSquareConfigured();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <Link href="/admin/inventory" className="text-sm font-semibold text-ink-muted hover:text-ink">
          ← Inventory
        </Link>
        <div className="ml-auto flex gap-2">
          <Button href={`/admin/vendors/${intake.vendor_id}`} variant="ghost" size="sm">
            {intake.vendor_name}
          </Button>
        </div>
      </div>

      {intake.square_status !== "synced" && !simulated ? (
        <div className="mb-4 rounded-xl border border-rust/30 bg-rust/10 p-4 text-sm text-rust print:hidden">
          <p className="font-semibold">Not in Square yet</p>
          {intake.square_error ? <p className="mt-1">{intake.square_error}</p> : null}
          <form action={retry} className="mt-2">
            <input type="hidden" name="id" value={intake.id} />
            <Button type="submit" size="sm">Try again</Button>
          </form>
        </div>
      ) : null}

      {(intake.square_status === "synced" || (simulated && intake.lines.every((l) => l.square_variation_id))) && !isReturn ? (
        <form action={printTags} className="card mb-4 flex flex-wrap items-end gap-3 p-4 print:hidden">
          <input type="hidden" name="id" value={intake.id} />
          <div className="w-full">
            <p className="font-semibold text-ink">Price tags</p>
            <p className="text-xs text-ink-muted">
              {units} tag{units === 1 ? "" : "s"} — one for each item, with its price and a barcode the register scans.
            </p>
          </div>
          <TagFormatFields />
          <Button type="submit" variant="accent">Print tags</Button>
        </form>
      ) : null}

      <div className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
              The Alley On Center · {isReturn ? "Stock returned" : consigned ? "Consignment intake" : "Stock received"}
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-ink">{intake.vendor_name}</h1>
            <p className="text-sm text-ink-soft">
              {formatDate(intake.received_on)} · sheet #{intake.id} · received by {intake.received_by}
            </p>
          </div>
          <Badge tone={intake.square_status === "synced" ? "success" : simulated ? "neutral" : "danger"} className="print:hidden">
            {intake.square_status === "synced" ? "In Square" : simulated ? "Square not connected here" : "Not in Square"}
          </Badge>
        </div>

        <table className="mt-5 w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-muted">
              <th className="py-2 pr-2">Item</th>
              <th className="py-2 pr-2">SKU</th>
              <th className="py-2 pr-2 text-right">Qty</th>
              <th className="py-2 pr-2 text-right">Price</th>
              <th className="py-2 text-right">{consigned ? "Their share" : "Cost each"}</th>
            </tr>
          </thead>
          <tbody>
            {intake.lines.map((l) => (
              <tr key={l.id} className="border-b border-line/60">
                <td className="py-2 pr-2 text-ink">{l.name}</td>
                <td className="py-2 pr-2 font-mono text-xs text-ink-soft">{l.sku}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{l.qty}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{formatMoney(l.price)}</td>
                <td className="py-2 text-right tabular-nums">
                  {consigned
                    ? `${l.split ?? intake.vendor_split ?? "default"}${l.split ?? intake.vendor_split ? "%" : ""}`
                    : l.unit_cost != null
                      ? formatMoney(l.unit_cost)
                      : "—"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="pt-3 font-semibold text-ink" colSpan={2}>Total</td>
              <td className="pt-3 text-right font-semibold tabular-nums">{units}</td>
              <td className="pt-3 text-right font-semibold tabular-nums">{formatMoney(value)}</td>
              <td />
            </tr>
          </tfoot>
        </table>

        {intake.notes ? <p className="mt-4 text-sm text-ink-soft">Notes: {intake.notes}</p> : null}
        <div className="mt-8 grid grid-cols-1 gap-6 text-sm sm:grid-cols-2">
          <div>
            <p className="border-b border-ink/40 pb-1 text-ink">{intake.signed_name || " "}</p>
            <p className="mt-1 text-xs text-ink-muted">{consigned ? "Consignor" : "Delivered by"}</p>
          </div>
          <div>
            <p className="border-b border-ink/40 pb-1 text-ink">{intake.received_by}</p>
            <p className="mt-1 text-xs text-ink-muted">For The Alley</p>
          </div>
        </div>
      </div>
      <p className="mt-3 text-xs text-ink-muted print:hidden">Print this page (⌘P) for a paper copy to hand them.</p>
    </div>
  );
}

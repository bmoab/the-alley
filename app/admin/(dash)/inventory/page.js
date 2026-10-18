import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, getActor } from "@/lib/auth.js";
import {
  listItems,
  listVendors,
  listIntakes,
  updateItem,
  returnStock,
  syncSquareSales,
  splitFor,
  round2,
  countWaitingDropoffs,
} from "@/lib/inventory.js";
import { isSquareConfigured } from "@/lib/square.js";
import { getSetting } from "@/lib/db.js";
import { logActivity } from "@/lib/activity.js";
import { venueDayOf, formatDateShort, formatMoney } from "@/lib/constants.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import Card from "@/components/admin/ui/Card.js";
import Badge from "@/components/admin/ui/Badge.js";
import Button from "@/components/admin/ui/Button.js";
import StatCard from "@/components/admin/ui/StatCard.js";
import Select from "@/components/admin/ui/Select.js";

export const metadata = { title: "Inventory" };
export const dynamic = "force-dynamic";

function back(message, type = "success", hash = "") {
  revalidatePath("/admin/inventory");
  redirect(`/admin/inventory?toast=${encodeURIComponent(message)}&toastType=${type}${hash}`);
}

async function saveItem(formData) {
  "use server";
  await requireAdmin();
  const id = Number(formData.get("id"));
  let item;
  try {
    item = updateItem(id, {
      name: formData.get("name"),
      split: formData.get("split"),
      notes: formData.get("notes"),
    });
  } catch (err) {
    back(err.message, "error");
  }
  logActivity({ eventType: "item_updated", description: `Updated ${item.name} (${item.sku})`, ...(await getActor()) });
  back(`${item.name} saved.`, "success", `#item-${id}`);
}

async function sendBack(formData) {
  "use server";
  await requireAdmin();
  const id = Number(formData.get("id"));
  const actor = await getActor();
  let left, intakeId, pushed;
  try {
    ({ left, intakeId, pushed } = await returnStock({ itemId: id, qty: formData.get("qty"), by: actor.actorName, reason: formData.get("reason") }));
  } catch (err) {
    back(err.message, "error");
  }
  logActivity({
    eventType: "stock_returned",
    description: `Returned ${formData.get("qty")} of item #${id} — ${String(formData.get("reason") || "back to the maker")}`,
    ...actor,
  });
  if (!pushed) redirect(`/admin/inventory/intake/${intakeId}?toast=${encodeURIComponent("Saved here, but Square didn't take it — press Try again.")}&toastType=error`);
  back(`Done — ${left} left on the shelf.`, "neutral", `#item-${id}`);
}

async function syncNow() {
  "use server";
  await requireAdmin();
  let r;
  try {
    r = await syncSquareSales();
  } catch (err) {
    back(`Square sync failed: ${err.message}`, "error");
  }
  back(
    r.simulated
      ? "Square isn't connected here, so there's nothing to pull."
      : `Synced: ${r.added} new sale line${r.added === 1 ? "" : "s"}, ${r.recounted} count${r.recounted === 1 ? "" : "s"} refreshed.`
  );
}

export default async function InventoryPage({ searchParams }) {
  await requireAdmin();
  const q = (searchParams?.q || "").toString();
  const vendorId = Number(searchParams?.vendor) || null;
  const status = ["active", "returned", "all"].includes(searchParams?.status) ? searchParams.status : "active";
  const items = listItems({ q, vendorId, status });
  const vendors = listVendors();
  const vendorById = Object.fromEntries(vendors.map((v) => [v.id, v]));
  const recent = listIntakes({ limit: 8 });
  const lastRun = getSetting("square_sales_last_run", "");

  const units = items.reduce((t, i) => t + i.qty_on_hand, 0);
  const shelfValue = round2(items.reduce((t, i) => t + i.qty_on_hand * i.price, 0));
  const waiting = countWaitingDropoffs();

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle="Makers' consigned items. They come in through drop-offs; Square rings them up and keeps the count. (Things The Alley buys outright live in Square — they still get price tags and shelf counts here.)"
      />

      <div className="mb-5 flex flex-wrap gap-2">
        <Button href="/admin/inventory/receive" variant="accent">+ Receive stock</Button>
        <form action={syncNow}>
          <Button type="submit" variant="ghost">Sync with Square</Button>
        </form>
      </div>
      {!isSquareConfigured() ? (
        <p className="mb-4 rounded-lg border border-line bg-paper-dim px-3 py-2 text-xs text-ink-muted">
          Square isn&apos;t connected on this copy of the site — items are saved here but not sent to the register.
        </p>
      ) : (
        <p className="mb-4 text-xs text-ink-muted">
          Counts and sales last pulled from Square {lastRun ? new Date(lastRun).toLocaleString("en-US", { timeZone: "America/Denver", dateStyle: "medium", timeStyle: "short" }) : "never"}.
        </p>
      )}

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Items on hand" value={units} hint={`${items.length} product${items.length === 1 ? "" : "s"}`} />
        <StatCard label="Shelf value" value={formatMoney(shelfValue)} hint="at full price" />
        <StatCard label="Drop-offs waiting" value={waiting} hint="listed by makers, not brought in yet" />
      </div>

      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Search name, SKU or maker" className="field max-w-xs" />
        <Select name="vendor" defaultValue={vendorId || ""} className="max-w-[14rem]" submitOnChange>
          <option value="">Everyone</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </Select>
        <Select name="status" defaultValue={status} className="max-w-[10rem]" submitOnChange>
          <option value="active">On the shelf</option>
          <option value="returned">Returned</option>
          <option value="all">All</option>
        </Select>
        <Button type="submit" variant="ghost">Filter</Button>
      </form>

      {items.length === 0 ? (
        <Card pad="md">
          <p className="text-sm text-ink-soft">
            {q || vendorId ? "Nothing matches." : "Nothing in stock yet — start with "}
            {!q && !vendorId ? (
              <Link href="/admin/inventory/receive" className="font-semibold underline">
                Receive stock
              </Link>
            ) : null}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((i) => {
            const vendor = vendorById[i.vendor_id];
            const terms = `${splitFor(i, vendor || { default_split: i.vendor_split })}% to the maker`;
            return (
              <details key={i.id} id={`item-${i.id}`} className="card p-4">
                <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-semibold text-ink">{i.name}</span>
                  <span className="font-mono text-xs text-ink-muted">{i.sku}</span>
                  <span className="text-xs text-ink-muted">{i.vendor_name}</span>
                  {i.status !== "active" ? <Badge tone="neutral">{i.status}</Badge> : null}
                  {!i.square_variation_id ? <Badge tone="danger">not in Square</Badge> : null}
                  <span className="ml-auto text-sm tabular-nums text-ink-soft">
                    <strong className={i.qty_on_hand <= 0 ? "text-rust" : "text-ink"}>{i.qty_on_hand}</strong> on hand ·{" "}
                    {formatMoney(i.price)}
                  </span>
                </summary>
                <p className="mt-2 text-xs text-ink-muted">
                  {terms} · {i.qty_received} received in total
                  {i.synced_at ? ` · count checked ${formatDateShort(venueDayOf(i.synced_at))}` : ""}
                </p>
                <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <form action={saveItem} className="rounded-lg bg-paper-dim p-3">
                    <input type="hidden" name="id" value={i.id} />
                    <label className="label">Name</label>
                    <input name="name" defaultValue={i.name} className="field" />
                    <label className="label mt-2">Their share (%) — blank uses {i.vendor_name}&apos;s default</label>
                    <input name="split" defaultValue={i.split ?? ""} inputMode="decimal" className="field" />
                    <label className="label mt-2">Notes</label>
                    <input name="notes" defaultValue={i.notes || ""} className="field" />
                    <p className="mt-2 text-xs text-ink-muted">
                      To change the price, receive more at the new price, or change it in Square.
                    </p>
                    <Button type="submit" size="sm" className="mt-2">Save</Button>
                  </form>
                  {i.qty_on_hand > 0 ? (
                    <form action={sendBack} className="rounded-lg bg-paper-dim p-3">
                      <input type="hidden" name="id" value={i.id} />
                      <p className="text-sm font-semibold text-ink">Take some off the shelf</p>
                      <p className="text-xs text-ink-muted">Picked up by the maker, damaged, or lost. Square&apos;s count is updated to match.</p>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        <div>
                          <label className="label">How many</label>
                          <input name="qty" inputMode="numeric" required className="field" />
                        </div>
                        <div className="col-span-2">
                          <label className="label">Why</label>
                          <input name="reason" required className="field" placeholder="Picked up by the maker" />
                        </div>
                      </div>
                      <Button type="submit" variant="danger" size="sm" className="mt-2">Remove from stock</Button>
                    </form>
                  ) : null}
                </div>
              </details>
            );
          })}
        </div>
      )}

      {recent.length ? (
        <Card pad="md" className="mt-8">
          <h2 className="text-base font-semibold text-ink">Recent stock sheets</h2>
          <ul className="mt-2 divide-y divide-line text-sm">
            {recent.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 py-2">
                <Link href={`/admin/inventory/intake/${s.id}`} className="font-semibold text-ink hover:underline">
                  #{s.id} · {s.vendor_name}
                </Link>
                <span className="text-ink-muted">
                  {formatDateShort(s.received_on)} · {s.units} item{Math.abs(s.units) === 1 ? "" : "s"}
                </span>
                {s.square_status !== "synced" ? <Badge tone="danger">not in Square</Badge> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

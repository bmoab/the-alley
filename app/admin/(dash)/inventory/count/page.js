import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, getActor } from "@/lib/auth.js";
import { shopCatalog, applyCount } from "@/lib/inventory.js";
import { logActivity } from "@/lib/activity.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import Button from "@/components/admin/ui/Button.js";
import Select from "@/components/admin/ui/Select.js";

export const metadata = { title: "Shelf count" };
export const dynamic = "force-dynamic";

async function saveCount(formData) {
  "use server";
  await requireAdmin();
  const cat = (formData.get("cat") || "").toString();
  const entries = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("count_") || String(value).trim() === "") continue;
    const variationId = key.slice(6);
    entries.push({ variationId, counted: value, baseline: formData.get(`base_${variationId}`) });
  }
  let result;
  try {
    // The form's one-time key: a double-submitted count is applied once.
    result = await applyCount(entries, { key: (formData.get("nonce") || "").toString().slice(0, 40) || undefined });
  } catch (err) {
    redirect(`/admin/inventory/count?cat=${encodeURIComponent(cat)}&toast=${encodeURIComponent(`Square didn't take it: ${err.message}`)}&toastType=error`);
  }
  if (result.changed) {
    logActivity({
      eventType: "stock_counted",
      description: `Shelf count${cat ? ` (${cat})` : ""}: ${result.changed} item${result.changed === 1 ? "" : "s"} corrected, ${result.net >= 0 ? "+" : ""}${result.net} overall`,
      ...(await getActor()),
    });
  }
  revalidatePath("/admin/inventory");
  redirect(
    `/admin/inventory/count?cat=${encodeURIComponent(cat)}&toast=${encodeURIComponent(
      result.changed ? `Square updated — ${result.changed} count${result.changed === 1 ? "" : "s"} corrected.` : "Everything matched. Nothing to change."
    )}&toastType=success`
  );
}

/**
 * Count a shelf and fix Square to match. Each row sends Square the DIFFERENCE
 * between what this page showed and what was counted, so a sale made while
 * someone's counting isn't undone. Leave a row blank to skip it.
 */
export default async function CountPage({ searchParams }) {
  await requireAdmin();
  const cat = (searchParams?.cat || "").toString();
  let rows = [];
  let error = null;
  try {
    rows = (await shopCatalog()).rows.filter((r) => r.tracked && r.count != null);
  } catch (err) {
    error = err.message;
  }
  const categories = [...new Set(rows.map((r) => r.categoryName || "Uncategorized"))].sort();
  const shown = cat ? rows.filter((r) => (r.categoryName || "Uncategorized") === cat) : [];

  return (
    <div>
      <PageHeader
        title="Shelf count"
        subtitle="Pick a shelf (each maker has their own category), count what's there, and Square's numbers are corrected to match."
      />
      {error ? <p className="mb-4 rounded-lg border border-rust/30 bg-rust/10 px-3 py-2 text-sm text-rust">Couldn&apos;t read Square: {error}</p> : null}

      <form className="mb-5 flex flex-wrap gap-2">
        <Select name="cat" defaultValue={cat} className="max-w-xs" submitOnChange>
          <option value="">Pick a category…</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="ghost">Show</Button>
      </form>

      {cat ? (
        <form action={saveCount} className="space-y-3">
          <input type="hidden" name="cat" value={cat} />
          <input type="hidden" name="nonce" value={randomUUID()} />
          <ul className="divide-y divide-line rounded-xl border border-line bg-paper">
            {shown.map((r) => (
              <li key={r.variationId} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">{[r.name, r.variationName].filter(Boolean).join(" · ")}</span>
                  <span className="text-xs text-ink-muted">
                    {r.sku || "no barcode"} · Square says <strong>{r.count}</strong>
                  </span>
                </span>
                <input type="hidden" name={`base_${r.variationId}`} value={r.count} />
                <input
                  name={`count_${r.variationId}`}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder={String(r.count)}
                  aria-label={`Counted: ${r.name}`}
                  className="field !w-20 text-right"
                />
              </li>
            ))}
          </ul>
          {shown.length ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="accent">Save count</Button>
              <span className="text-xs text-ink-muted">Blank rows are left as they are. Missing items are written off in Square as lost.</span>
            </div>
          ) : (
            <p className="text-sm text-ink-muted">Nothing with a stock count in that category.</p>
          )}
        </form>
      ) : null}
    </div>
  );
}

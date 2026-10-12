"use client";
import { useMemo, useState } from "react";

/**
 * Pick what to print tags for, from everything in Square. Quantities start at
 * how many are in stock; the server re-reads the catalog when it prints, so
 * names and prices on the tags are always Square's current ones.
 */
export default function TagPicker({ rows, formats, codes, action }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [qty, setQty] = useState({});
  const categories = useMemo(() => [...new Set(rows.map((r) => r.categoryName).filter(Boolean))].sort(), [rows]);
  const shown = rows.filter(
    (r) =>
      (!cat || r.categoryName === cat) &&
      (!q || `${r.name} ${r.variationName} ${r.sku} ${r.maker || ""}`.toLowerCase().includes(q.toLowerCase()))
  );
  const chosen = Object.entries(qty).filter(([, n]) => Number(n) > 0);
  const total = chosen.reduce((t, [, n]) => t + Number(n), 0);
  const set = (id, n) => setQty((m) => ({ ...m, [id]: n }));
  const fillShown = () => setQty((m) => ({ ...m, ...Object.fromEntries(shown.map((r) => [r.variationId, String(Math.max(r.count ?? 1, 1))])) }));
  const clear = () => setQty({});

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="items" value={JSON.stringify(chosen.map(([variationId, n]) => ({ variationId, qty: n })))} />
      <div className="flex flex-wrap gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, maker or number" className="field max-w-xs" />
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="field max-w-[14rem]">
          <option value="">Every category</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button type="button" onClick={fillShown} className="rounded-lg border border-line-strong px-3 text-sm font-semibold text-ink-soft hover:text-ink">
          One per item in stock
        </button>
        {total ? (
          <button type="button" onClick={clear} className="px-2 text-sm font-semibold text-ink-muted hover:text-ink">
            Clear
          </button>
        ) : null}
      </div>

      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-muted">
              <th className="py-1.5 pr-2">Item</th>
              <th className="py-1.5 pr-2">Barcode no.</th>
              <th className="py-1.5 pr-2 text-right">Price</th>
              <th className="py-1.5 pr-2 text-right">In stock</th>
              <th className="py-1.5 text-right">Tags</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.variationId} className="border-b border-line/60">
                <td className="py-1.5 pr-2">
                  <span className="text-ink">{[r.name, r.variationName].filter(Boolean).join(" · ")}</span>
                  <span className="block text-xs text-ink-muted">{r.maker ? `${r.maker} · consigned` : r.categoryName || "The Alley"}</span>
                </td>
                <td className="py-1.5 pr-2 font-mono text-xs">{r.sku || <span className="text-rust">none yet</span>}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{r.price != null ? `$${r.price.toFixed(2)}` : "—"}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{r.count ?? "—"}</td>
                <td className="py-1.5 text-right">
                  <input
                    value={qty[r.variationId] || ""}
                    onChange={(e) => set(r.variationId, e.target.value.replace(/\D/g, ""))}
                    inputMode="numeric"
                    placeholder="0"
                    className="field !h-8 !w-16 text-right"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length ? <p className="py-4 text-sm text-ink-muted">Nothing matches.</p> : null}
      </div>

      <div className="sticky bottom-20 z-10 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-paper p-3 shadow-card lg:bottom-4">
        <div className="min-w-[14rem] flex-1">
          <label className="label">Labels</label>
          <select name="format" defaultValue="sheet30" className="field">
            {Object.entries(formats).map(([k, f]) => (
              <option key={k} value={k}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
<div className="w-36">
          <label className="label">Code</label>
          <select name="code" defaultValue="qr" className="field">
            {Object.entries(codes).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="w-28">
          <label className="label">Start at label #</label>
          <input name="start_at" inputMode="numeric" defaultValue="1" className="field" />
        </div>
        <button
          type="submit"
          disabled={!total}
          className="h-10 rounded-xl bg-ink px-5 text-sm font-semibold text-paper hover:bg-ink-soft disabled:opacity-40"
        >
          Print {total || ""} tag{total === 1 ? "" : "s"}
        </button>
      </div>
    </form>
  );
}

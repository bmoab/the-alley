"use client";
import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import PhotoPick from "./PhotoPick.js";

/**
 * Sort items into groups, add a photo of each and, on the maker's own page,
 * put in what each costs them to make (private to them) — all optional. A
 * group's cost box fills every item in it. The server re-checks the items are theirs
 * (lib/inventory.js saveItemSetup); groups never reach Square.
 */

function Save({ label }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-10 rounded-lg bg-ink px-5 text-sm font-semibold text-paper hover:bg-ink-soft disabled:opacity-50"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

export default function ItemSetup({ items, suggestions = [], hidden, action, groupAction, showCost = false, listId = "item-groups" }) {
  const [rows, setRows] = useState(() =>
    items.map((i) => ({ id: i.id, name: i.name, saved: i.group || "", group: i.group || "", photo: i.photo || "", cost: i.cost != null ? String(i.cost) : "" }))
  );
  const update = (id, patch) => setRows((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const groupNames = useMemo(
    () => [...new Set(rows.map((r) => r.group.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [rows]
  );
  // Sorted by the groups as saved, so a row doesn't jump while its group is typed.
  const sections = useMemo(() => {
    const out = {};
    for (const r of rows) (out[r.saved.toLowerCase()] ||= { name: r.saved, rows: [] }).rows.push(r);
    return Object.values(out).sort((a, b) => (!a.name ? 1 : !b.name ? -1 : a.name.localeCompare(b.name)));
  }, [rows]);
  const hiddenFields = Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />);

  return (
    <div className="space-y-4">
      {suggestions.length && groupAction ? (
        <form action={groupAction} className="rounded-xl border border-verde-deep/40 bg-verde/30 p-3 text-sm">
          {hiddenFields}
          <p className="text-ink">
            Sort by name? Items that start the same way would go together:{" "}
            {suggestions.map((g) => `${g.name} (${g.count})`).join(", ")}.
          </p>
          <div className="mt-2">
            <Save label="Sort them" />
          </div>
        </form>
      ) : null}

      <form action={action} className="space-y-4">
        {hiddenFields}
        <input type="hidden" name="rows" value={JSON.stringify(rows.map(({ name, saved, ...r }) => r))} />
        <datalist id={listId}>
          {groupNames.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
        {sections.map((s) => (
          <div key={s.name || "~none"} className="overflow-hidden rounded-xl border border-line">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-paper-warm px-3 py-2">
              <span className="text-sm font-semibold text-ink">{s.name || "No group"}</span>
              {showCost && s.name && s.rows.length > 1 ? (
                <label className="flex items-center gap-2 text-xs text-ink-muted">
                  Cost for all
                  <span className="relative">
                    <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-ink-muted">$</span>
                    <input
                      inputMode="decimal"
                      placeholder="0.00"
                      aria-label={`Your cost for every ${s.name}`}
                      onChange={(e) => {
                        const v = e.target.value;
                        const ids = new Set(s.rows.map((r) => r.id));
                        setRows((list) => list.map((r) => (ids.has(r.id) ? { ...r, cost: v } : r)));
                      }}
                      className="field !h-8 w-24 text-sm"
                      style={{ paddingLeft: 20 }}
                    />
                  </span>
                </label>
              ) : null}
            </div>
            <ul className="divide-y divide-line">
              {s.rows.map((r) => (
                <li key={r.id} className="flex gap-3 px-3 py-2">
                  <PhotoPick value={r.photo} onChange={(photo) => update(r.id, { photo })} label={`photo of ${r.name}`} />
                  <div
                    className={`grid min-w-0 flex-1 gap-2 sm:items-center ${
                      showCost ? "grid-cols-[minmax(0,1fr)_6.5rem] sm:grid-cols-[minmax(0,1fr)_12rem_7rem]" : "grid-cols-1 sm:grid-cols-[minmax(0,1fr)_14rem]"
                    }`}
                  >
                    <span className={`min-w-0 text-sm text-ink ${showCost ? "col-span-2 sm:col-span-1" : ""}`}>{r.name}</span>
                    <input
                      value={r.group}
                      onChange={(e) => update(r.id, { group: e.target.value })}
                      list={listId}
                      maxLength={60}
                      placeholder="Group (optional)"
                      aria-label={`Group for ${r.name}`}
                      className="field !h-9 text-sm"
                    />
                    {showCost ? (
                      <span className="relative">
                        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-ink-muted">$</span>
                        <input
                          value={r.cost}
                          onChange={(e) => update(r.id, { cost: e.target.value })}
                          inputMode="decimal"
                          placeholder="Cost"
                          aria-label={`Your cost for ${r.name}`}
                          className="field !h-9 text-sm"
                          style={{ paddingLeft: 22 }}
                        />
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <Save label="Save" />
          <p className="text-xs text-ink-muted">
            {showCost
              ? "All optional. Your costs are private: only you see them, and they don't change what you're paid."
              : "All optional. Groups only sort their sales here; nothing changes in Square or on the price tags."}
          </p>
        </div>
      </form>
    </div>
  );
}

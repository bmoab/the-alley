"use client";
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { sendDropoff } from "@/app/maker/actions.js";
import PhotoPick from "./PhotoPick.js";

/**
 * A maker lists what they're bringing in: more of something already in the
 * shop, or something new, with how many and the price — and, if they like, a
 * photo and the group it goes in (picking one of theirs fills in its price). The server
 * re-checks everything (lib/inventory.js submitDropoff).
 */

let rowKey = 0;
const blankRow = () => ({ key: ++rowKey, itemId: "", name: "", group: "", photo: "", qty: "", price: "" });

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-11 rounded-xl bg-ink px-5 text-sm font-semibold text-paper hover:bg-ink-soft disabled:opacity-50"
    >
      {pending ? "Sending…" : "Send drop-off list"}
    </button>
  );
}

export default function DropoffForm({
  items,
  groups = [],
  hidden,
  placeholder = "e.g. Silver leaf necklace",
  groupPlaceholder = "e.g. Large Candle",
}) {
  const [state, formAction] = useFormState(sendDropoff, null);
  const [rows, setRows] = useState([blankRow()]);
  const update = (key, patch) => setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const units = rows.reduce((t, r) => t + (Number.parseInt(r.qty, 10) || 0), 0);
  const value = rows.reduce((t, r) => t + (Number.parseInt(r.qty, 10) || 0) * (Number(r.price) || 0), 0);

  return (
    <form action={formAction} className="space-y-3">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <input type="hidden" name="lines" value={JSON.stringify(rows.map(({ key, ...r }) => r))} />
      {rows.map((r, idx) => (
        <div key={r.key} className="grid grid-cols-6 gap-2 rounded-lg border border-line p-3">
          <div className="col-span-6">
            <label className="label">Item {idx + 1}</label>
            {items.length ? (
              <select
                value={r.itemId}
                onChange={(e) => {
                  const item = items.find((i) => String(i.id) === e.target.value);
                  update(r.key, { itemId: e.target.value, name: "", group: "", photo: "", price: item ? String(item.price) : "" });
                }}
                className="field mb-1"
              >
                <option value="">Something new…</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    More of: {i.name}
                  </option>
                ))}
              </select>
            ) : null}
            {!r.itemId ? (
              <div className="flex items-center gap-2">
                <PhotoPick value={r.photo} onChange={(photo) => update(r.key, { photo })} label="photo" />
                <input
                  value={r.name}
                  onChange={(e) => update(r.key, { name: e.target.value })}
                  placeholder={placeholder}
                  maxLength={120}
                  className="field"
                />
              </div>
            ) : null}
          </div>
          {!r.itemId ? (
            <div className="col-span-6">
              <label className="label">Group (optional)</label>
              <input
                value={r.group}
                onChange={(e) => update(r.key, { group: e.target.value })}
                maxLength={60}
                placeholder={groupPlaceholder}
                className="field"
              />
              {groups.length ? (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {groups.map((g) => {
                    const on = r.group.trim().toLowerCase() === g.name.toLowerCase();
                    return (
                      <button
                        key={g.name}
                        type="button"
                        aria-pressed={on}
                        // Same group, same price: fill it in unless they've typed one.
                        onClick={() => update(r.key, on ? { group: "" } : { group: g.name, ...(r.price ? {} : { price: String(g.price) }) })}
                        className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                          on ? "border-ink bg-ink text-paper" : "border-line text-ink-soft hover:border-ink-muted hover:text-ink"
                        }`}
                      >
                        {g.name}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="col-span-2">
            <label className="label">How many</label>
            <input value={r.qty} onChange={(e) => update(r.key, { qty: e.target.value })} inputMode="numeric" className="field" />
          </div>
          <div className="col-span-3">
            <label className="label">Price each</label>
            <input value={r.price} onChange={(e) => update(r.key, { price: e.target.value })} inputMode="decimal" placeholder="$" className="field" />
          </div>
          <div className="col-span-1 flex items-end justify-end">
            {rows.length > 1 ? (
              <button
                type="button"
                onClick={() => setRows((list) => list.filter((x) => x.key !== r.key))}
                className="h-10 text-xs font-semibold text-rust hover:underline"
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setRows((list) => [...list, blankRow()])}
        className="rounded-lg border border-dashed border-line-strong px-3 py-2 text-sm font-semibold text-ink-muted hover:text-ink"
      >
        + Another item
      </button>
      <p className="text-sm text-ink-soft">
        {units} item{units === 1 ? "" : "s"} · ${value.toFixed(2)} at your prices
      </p>
      <div>
        <label className="label">Anything we should know? (optional)</label>
        <input name="notes" maxLength={1000} className="field" placeholder="When you're coming in, display ideas…" />
      </div>
      {state?.error ? (
        <p className="rounded-lg border border-rust/30 bg-rust/10 px-3 py-2 text-sm text-rust">{state.error}</p>
      ) : null}
      <Submit />
    </form>
  );
}

"use client";
import { useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import Select from "@/components/admin/ui/Select.js";

/**
 * The paper intake sheet, on a screen: which maker, then a row per item —
 * something they've brought before, or something new — with how many, the
 * price and (if it differs from theirs) the split. Opened from a maker's
 * drop-off list, it starts filled in with what they said they'd bring; staff
 * fix the counts to what's actually in the box.
 *
 * Rows travel to the server as one JSON field; the server re-validates all of
 * it (lib/inventory.js recordIntake), so nothing here is trusted.
 */

let rowKey = 0;
const blankRow = (r = {}) => ({ key: ++rowKey, itemId: "", name: "", qty: "", price: "", split: "", ...r });

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-11 rounded-xl bg-ink px-5 text-sm font-semibold text-paper hover:bg-ink-soft disabled:opacity-50"
    >
      {pending ? "Saving and sending to Square…" : "Receive stock"}
    </button>
  );
}

export default function ReceiveStockForm({
  vendors,
  itemsByVendor,
  defaultSplit,
  today,
  receiveAction,
  initialVendorId = "",
  dropoff = null,
}) {
  const [state, formAction] = useFormState(receiveAction, null);
  const [vendorId, setVendorId] = useState(String(dropoff?.vendor_id || initialVendorId || ""));
  const [rows, setRows] = useState(() =>
    dropoff
      ? dropoff.lines.map((l) => blankRow({ itemId: l.item_id ? String(l.item_id) : "", name: l.item_id ? "" : l.name, qty: String(l.qty), price: String(l.price) }))
      : [blankRow()]
  );
  const vendor = vendors.find((v) => String(v.id) === vendorId) || null;
  const isNewVendor = vendorId === "new";
  const items = useMemo(() => (vendor ? itemsByVendor[vendor.id] || [] : []), [vendor, itemsByVendor]);
  const splitHint = vendor?.default_split ?? defaultSplit;

  function update(key, patch) {
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function pickItem(key, itemId) {
    const item = items.find((i) => String(i.id) === itemId);
    update(key, {
      itemId,
      name: "",
      price: item ? String(item.price) : "",
      split: item?.split != null ? String(item.split) : "",
    });
  }

  const units = rows.reduce((t, r) => t + (Number.parseInt(r.qty, 10) || 0), 0);
  const retail = rows.reduce((t, r) => t + (Number.parseInt(r.qty, 10) || 0) * (Number(r.price) || 0), 0);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="lines" value={JSON.stringify(rows.map(({ key, ...r }) => r))} />
      {dropoff ? <input type="hidden" name="dropoff_id" value={dropoff.id} /> : null}

      <div className="card p-5">
        <h2 className="text-base font-semibold text-ink">Who&apos;s it from?</h2>
        {dropoff ? (
          <p className="mt-1 text-sm text-ink-soft">
            From {dropoff.vendor_name}&apos;s drop-off list. Count what&apos;s actually in the box and fix any numbers before you
            receive it.
          </p>
        ) : null}
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Maker</label>
            {dropoff ? <input type="hidden" name="vendor_id" value={vendorId} /> : null}
            <Select
              name={dropoff ? undefined : "vendor_id"}
              value={vendorId}
              disabled={!!dropoff}
              onChange={(v) => {
                setVendorId(v);
                setRows([blankRow()]);
              }}
              required
            >
              <option value="" disabled>
                Pick one…
              </option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
              <option value="new">+ Someone new</option>
            </Select>
          </div>
          <div>
            <label className="label">Date received</label>
            <input name="received_on" type="date" defaultValue={today} required className="field" />
          </div>
        </div>
        {isNewVendor ? (
          <div className="mt-3 grid grid-cols-1 gap-3 rounded-lg bg-paper-dim p-3 sm:grid-cols-2">
            <div>
              <label className="label">Their name / shop name</label>
              <input name="new_vendor_name" required className="field" />
            </div>
            <div>
              <label className="label">Email (optional)</label>
              <input name="new_vendor_email" type="email" className="field" />
            </div>
            <div>
              <label className="label">Phone (optional)</label>
              <input name="new_vendor_phone" type="tel" className="field" />
            </div>
            <div>
              <label className="label">Their share of each sale (%)</label>
              <input name="new_vendor_split" inputMode="decimal" placeholder={String(defaultSplit)} className="field" />
              <p className="mt-1 text-xs text-ink-muted">Blank = the shop default ({defaultSplit}%).</p>
            </div>
          </div>
        ) : null}
        {vendor ? (
          <p className="mt-2 text-xs text-ink-muted">
            {vendor.name} gets {splitHint}% of each sale unless an item says otherwise.
          </p>
        ) : null}
      </div>

      {vendorId ? (
        <div className="card p-5">
          <h2 className="text-base font-semibold text-ink">What came in</h2>
          <div className="mt-3 space-y-3">
            {rows.map((r, idx) => (
              <div key={r.key} className="grid grid-cols-1 gap-2 rounded-lg border border-line p-3 sm:grid-cols-12 sm:items-end">
                <div className="sm:col-span-4">
                  <label className="label">Item {idx + 1}</label>
                  {items.length ? (
                    <Select value={r.itemId} onChange={(v) => pickItem(r.key, v)} className="mb-1">
                      <option value="">Something new…</option>
                      {items.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name} · {i.sku}
                        </option>
                      ))}
                    </Select>
                  ) : null}
                  {!r.itemId ? (
                    <input
                      value={r.name}
                      onChange={(e) => update(r.key, { name: e.target.value })}
                      placeholder="e.g. Silver leaf necklace"
                      className="field"
                    />
                  ) : null}
                </div>
                <div className="sm:col-span-2">
                  <label className="label">How many</label>
                  <input value={r.qty} onChange={(e) => update(r.key, { qty: e.target.value })} inputMode="numeric" className="field" />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Price each</label>
                  <input value={r.price} onChange={(e) => update(r.key, { price: e.target.value })} inputMode="decimal" placeholder="$" className="field" />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Their %</label>
                  <input
                    value={r.split}
                    onChange={(e) => update(r.key, { split: e.target.value })}
                    inputMode="decimal"
                    placeholder={String(splitHint)}
                    className="field"
                  />
                </div>
                <div className="flex justify-end sm:col-span-2">
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
          </div>
          <button
            type="button"
            onClick={() => setRows((list) => [...list, blankRow()])}
            className="mt-3 rounded-lg border border-dashed border-line-strong px-3 py-2 text-sm font-semibold text-ink-muted hover:text-ink"
          >
            + Another item
          </button>
          <p className="mt-3 text-sm text-ink-soft">
            {units} item{units === 1 ? "" : "s"} · ${retail.toFixed(2)} at full price
          </p>
        </div>
      ) : null}

      {vendorId ? (
        <div className="card p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Signed for by (the person dropping it off)</label>
              <input name="signed_name" className="field" placeholder="Type their name" />
            </div>
            <div>
              <label className="label">Notes (optional)</label>
              <input name="notes" className="field" placeholder="Condition, display, anything agreed" />
            </div>
          </div>
          {state?.error ? (
            <p className="mt-4 rounded-lg border border-rust/30 bg-rust/10 px-3 py-2 text-sm text-rust">{state.error}</p>
          ) : null}
          <div className="mt-4">
            <Submit />
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            New items go into Square with their price, sales tax and a barcode number, and the stock count goes up — next
            you&apos;ll print the price tags.
          </p>
        </div>
      ) : null}
    </form>
  );
}

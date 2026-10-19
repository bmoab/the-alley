"use client";
import { useFormStatus } from "react-dom";
import Button from "../ui/Button.js";

function Add() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "Adding…" : "Add maker"}</Button>;
}

/** A new consignor. `manager` = may set a share other than the shop default. */
export default function AddMakerForm({ action, manager, defaultSplit }) {
  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="new-maker-name">Name or shop name</label>
          <input id="new-maker-name" name="name" required autoFocus className="field" placeholder="Juniper Ceramics" />
        </div>
        <div>
          <label className="label" htmlFor="new-maker-contact">Contact person</label>
          <input id="new-maker-contact" name="contact_name" className="field" />
        </div>
        <div>
          <label className="label" htmlFor="new-maker-email">Email</label>
          <input id="new-maker-email" name="email" type="email" className="field" placeholder="maker@email.com" />
        </div>
        <div>
          <label className="label" htmlFor="new-maker-phone">Phone</label>
          <input id="new-maker-phone" name="phone" type="tel" className="field" />
        </div>
        {manager ? (
          <div>
            <label className="label" htmlFor="new-maker-split">Their share of each sale</label>
            <div className="relative">
              <input
                id="new-maker-split"
                name="default_split"
                inputMode="decimal"
                placeholder={`${defaultSplit} (shop default)`}
                className="field pr-8"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-muted">%</span>
            </div>
          </div>
        ) : null}
        <div>
          <label className="label" htmlFor="new-maker-pay">How they like to be paid</label>
          <input id="new-maker-pay" name="payout_method" className="field" placeholder="Venmo @…, check, Zelle…" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="new-maker-notes">Notes</label>
          <input id="new-maker-notes" name="notes" className="field" />
        </div>
      </div>
      <p className="text-xs text-ink-muted">Their email is how they sign in to see their sales and payouts.</p>
      <div className="flex justify-end">
        <Add />
      </div>
    </form>
  );
}

"use client";
import { useFormStatus } from "react-dom";
import Button from "../ui/Button.js";

function Add() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "Adding…" : "Add business"}</Button>;
}

/** Just the name and email; everything else is set on their page after. */
export default function AddTenantForm({ action }) {
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="new-biz-name">Business name</label>
        <input id="new-biz-name" name="business_name" required autoFocus className="field" placeholder="Juniper Ceramics" />
      </div>
      <div>
        <label className="label" htmlFor="new-biz-email">Their email</label>
        <input id="new-biz-email" name="contact_email" type="email" className="field" placeholder="owner@shop.com" />
        <p className="mt-1 text-xs text-ink-muted">Where their private link goes, so they can fill in their own page.</p>
      </div>
      <div className="flex justify-end">
        <Add />
      </div>
    </form>
  );
}

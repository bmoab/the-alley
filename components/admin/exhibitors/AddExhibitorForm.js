"use client";
import { useFormStatus } from "react-dom";
import Button from "../ui/Button.js";

function Add() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "Adding…" : "Add exhibitor"}</Button>;
}

/** Name, email and (if known) when their agreement ends; the artist fills in the rest. */
export default function AddExhibitorForm({ action }) {
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="new-ex-name">Name</label>
        <input id="new-ex-name" name="name" required autoFocus className="field" placeholder="Artist or studio name" />
      </div>
      <div>
        <label className="label" htmlFor="new-ex-email">Their email</label>
        <input id="new-ex-email" name="contact_email" type="email" className="field" placeholder="artist@email.com" />
        <p className="mt-1 text-xs text-ink-muted">Where their private link goes, so they can fill in their own page.</p>
      </div>
      <div>
        <label className="label" htmlFor="new-ex-until">Agreement ends (optional)</label>
        <input id="new-ex-until" name="active_until" type="date" className="field" />
      </div>
      <div className="flex justify-end">
        <Add />
      </div>
    </form>
  );
}

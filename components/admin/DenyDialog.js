"use client";
import { useEffect, useState } from "react";
import { useFormStatus, createPortal } from "react-dom";
import { DENIAL_REASONS } from "@/lib/denial.js";
import Button from "@/components/admin/ui/Button.js";

/**
 * Deny-a-request dialog. Captures a structured reason BEFORE the denial is
 * finalized: a required preset dropdown that maps to both an internal log label
 * and a gracious client phrasing, plus an optional internal note. When "Other"
 * is chosen the free text is required and stays internal-only — the client
 * always gets a neutral, gracious email (see lib/denial.js).
 */
function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="danger" disabled={pending}>
      {pending ? "Denying…" : "Deny & notify client"}
    </Button>
  );
}

export default function DenyDialog({ bookingId, clientName, denyAction }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("date_unavailable");
  const [mounted, setMounted] = useState(false);
  const isOther = reason === "other";

  // Portal target is only available on the client.
  useEffect(() => setMounted(true), []);

  return (
    <>
      <Button type="button" variant="danger" size="sm" onClick={() => setOpen(true)}>
        Deny
      </Button>

      {/* The dialog (which contains its OWN <form>) is portaled to <body> so it
          is NOT nested inside the request card's pricing <form> — nested forms
          are invalid HTML and would silently swallow the deny submission. */}
      {mounted && open
        ? createPortal(
        <div className="admin-ui fixed inset-0 z-[60] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
          <button
            aria-label="Cancel"
            onClick={() => setOpen(false)}
            className="absolute inset-0 animate-fade-in bg-ink/40"
          />
          <div className="relative z-10 w-full max-w-md animate-fade-in-up rounded-t-2xl border border-line bg-paper p-6 shadow-card sm:rounded-2xl">
            <h3 className="text-lg font-semibold text-ink">Deny this request</h3>
            <p className="mt-1 text-sm text-ink-muted">
              {clientName ? `${clientName}'s request will be declined and the slot freed. ` : ""}
              We&apos;ll send a warm, brief note — the internal reason stays private.
            </p>

            <form action={denyAction} className="mt-5 space-y-4">
              <input type="hidden" name="id" value={bookingId} />

              <div>
                <label className="label" htmlFor={`reason-${bookingId}`}>Reason (internal)</label>
                <select
                  id={`reason-${bookingId}`}
                  name="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="field"
                >
                  {DENIAL_REASONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label" htmlFor={`note-${bookingId}`}>
                  {isOther ? "Reason details (internal only)" : "Internal note (optional)"}
                </label>
                <textarea
                  id={`note-${bookingId}`}
                  name="reason_note"
                  required={isOther}
                  rows={2}
                  className="field"
                  placeholder={
                    isOther
                      ? "Describe the reason — for your records only, never emailed."
                      : "Anything to remember about this denial (optional)."
                  }
                />
                <p className="mt-1 text-xs text-ink-muted">
                  The client receives a gracious message
                  {isOther ? " — your note here is never sent to them." : " based on the reason above."}
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <ConfirmButton />
              </div>
            </form>
          </div>
        </div>,
            document.body
          )
        : null}
    </>
  );
}

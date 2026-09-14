"use client";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import Button from "./Button.js";

/**
 * A submit button that asks first, for actions that can't be taken back.
 *
 * Two-step rather than window.confirm(): the native dialog can't explain what
 * is about to happen in any detail, and on a bulk email "how many, to whom" is
 * exactly the bit the owner needs to read before committing.
 *
 * Must be rendered INSIDE the <form> it submits — useFormStatus only reports on
 * the form above it in the tree, which is what disables the button and shows
 * progress while a long send is in flight.
 */
function Submit({ label, pendingLabel }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

export default function ConfirmButton({
  label,
  confirmLabel = "Yes, do it",
  pendingLabel = "Working…",
  question,
  disabled = false,
  disabledLabel,
}) {
  const [armed, setArmed] = useState(false);

  if (disabled) {
    return (
      <Button type="button" variant="ghost" disabled>
        {disabledLabel || label}
      </Button>
    );
  }

  if (!armed) {
    return (
      <Button type="button" onClick={() => setArmed(true)}>
        {label}
      </Button>
    );
  }

  return (
    <div className="rounded-xl border border-gold/40 bg-gold/10 p-4">
      <p className="text-sm text-ink">{question}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Submit label={confirmLabel} pendingLabel={pendingLabel} />
        <Button type="button" variant="ghost" onClick={() => setArmed(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

"use client";
import { useFormStatus } from "react-dom";
import Button from "./Button.js";

/** A submit button that says what it's doing while its form sends. Render it inside the <form>. */
export default function PendingButton({ label, pendingLabel = "Saving…", ...props }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

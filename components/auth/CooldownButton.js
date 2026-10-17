"use client";
import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import Button from "@/components/admin/ui/Button.js";

const read = (key) => {
  try {
    return Number(sessionStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
};

/**
 * The submit button on a "send me an email" form. It locks while sending, then
 * for `seconds` after — counting down, so it's clear the email went and pressing
 * again won't make it come faster. The server throttles too; this just stops
 * the button from looking like it does nothing.
 */
export default function CooldownButton({ storageKey, seconds = 60, unstyled = false, children, ...props }) {
  const { pending } = useFormStatus();
  const [left, setLeft] = useState(0);

  useEffect(() => {
    const tick = () => setLeft(Math.max(0, Math.ceil((read(storageKey) + seconds * 1000 - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [storageKey, seconds]);

  // Only once the form will actually submit — a blank email box shouldn't lock it.
  const start = (e) => {
    if (e.currentTarget.form && !e.currentTarget.form.checkValidity()) return;
    try {
      sessionStorage.setItem(storageKey, String(Date.now()));
    } catch {}
  };

  const label = pending ? "Sending…" : left > 0 ? `Sent — again in ${left}s` : children;
  // `unstyled`: a plain <button> that takes the caller's className (the account pages' own look).
  const Tag = unstyled ? "button" : Button;
  return (
    <Tag type="submit" disabled={pending || left > 0} onClick={left > 0 ? undefined : start} {...props}>
      {label}
    </Tag>
  );
}

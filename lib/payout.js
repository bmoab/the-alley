/**
 * How a maker or artist likes to be paid, kept as one readable line
 * ("Venmo · @kelli-c") in vendors.payout_method. Safe for the browser.
 */
export const PAYOUT_KINDS = [
  { key: "Venmo", label: "Venmo username", placeholder: "@your-name" },
  { key: "Zelle", label: "Zelle phone or email", placeholder: "Phone number or email" },
  { key: "Check", label: "Mailing address", placeholder: "Or leave blank to pick it up at the shop" },
  { key: "PayPal", label: "PayPal email", placeholder: "you@email.com" },
  { key: "Other", label: "How?", placeholder: "Tell us how" },
];

const KNOWN = /^(venmo|zelle|check|paypal)\b[\s·:,-]*(.*)$/i;

/** { kind, handle } from what's saved. A bare "@name" is a Venmo username. */
export function parsePayout(value) {
  const v = String(value || "").trim();
  if (!v) return { kind: "", handle: "" };
  if (/^@\S+$/.test(v)) return { kind: "Venmo", handle: v };
  const m = v.match(KNOWN);
  if (m) {
    const kind = PAYOUT_KINDS.find((k) => k.key.toLowerCase() === m[1].toLowerCase()).key;
    return { kind, handle: m[2].trim() };
  }
  return { kind: "Other", handle: v };
}

export function joinPayout(kind, handle) {
  const h = String(handle || "").trim();
  if (!kind) return "";
  if (kind === "Other") return h;
  return h ? `${kind} · ${h}` : kind;
}

/** "Venmo · @kelli-c" — what's saved, tidied for showing. */
export function formatPayout(value) {
  const { kind, handle } = parsePayout(value);
  return joinPayout(kind, handle);
}

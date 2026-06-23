/**
 * Denial reasons (client-safe — no database import).
 *
 * Each preset maps a dropdown option to BOTH an internal log label and a polite,
 * client-facing phrasing. "Other" stores whatever free text the user typed for
 * the INTERNAL log, but the client email always uses a neutral, gracious default
 * so a blunt internal note can never be sent to a client.
 */

export const NEUTRAL_DENIAL =
  "Unfortunately, we're unable to accommodate this request at this time.";

export const DENIAL_REASONS = [
  {
    value: "date_unavailable",
    label: "Date unavailable",
    client: "Unfortunately, that date is no longer available.",
  },
  {
    value: "policy",
    label: "Doesn't fit venue policy",
    client: "Unfortunately, this event isn't a fit for our space's guidelines.",
  },
  {
    value: "incomplete",
    label: "Incomplete information",
    client:
      "We need a few more details before we can confirm — please reach out so we can help.",
  },
  {
    value: "held",
    label: "Held for another event",
    client: "That time is being held for another event.",
  },
  {
    value: "other",
    label: "Other",
    client: NEUTRAL_DENIAL,
  },
];

/**
 * Resolve a submitted denial into:
 *   internalLabel   what the activity log records (candid; never emailed)
 *   clientPhrasing  the gracious line sent to the client
 *   reasonValue     normalized dropdown value
 */
export function resolveDenial(reasonValue, freeText) {
  const note = (freeText || "").trim();
  const preset = DENIAL_REASONS.find((r) => r.value === reasonValue);

  // "Other" (or anything unrecognized): internal = free text, client = neutral.
  if (!preset || reasonValue === "other") {
    return {
      reasonValue: "other",
      internalLabel: note || "Other",
      clientPhrasing: NEUTRAL_DENIAL,
    };
  }

  // Preset: optional free text becomes an internal-only note appended to label.
  return {
    reasonValue: preset.value,
    internalLabel: note ? `${preset.label} — ${note}` : preset.label,
    clientPhrasing: preset.client,
  };
}

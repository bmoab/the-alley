/**
 * Inline field/label styles shared by the booking modal and the date-time
 * picker it lends to other pages.
 *
 * These live here rather than in BookContext because SmartTime reads `labStyle`
 * — leaving them in BookContext and importing them into the extracted picker
 * would make BookContext → DayTimePicker → BookContext, an import cycle.
 */

export const fieldStyle = {
  width: "100%",
  padding: "12px 14px",
  border: "1px solid var(--line-strong)",
  background: "var(--paper-dim)",
  fontFamily: "var(--font-body)",
  fontSize: 16,
  color: "var(--ink)",
  borderRadius: 0,
  outline: "none",
};

export const labStyle = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  letterSpacing: ".12em",
  textTransform: "uppercase",
  color: "var(--ink-muted)",
  marginBottom: 7,
  display: "block",
};

import { getSetting, getContentValue } from "./db.js";
import { SPACES, SPACE_BY_ID } from "./constants.js";

/**
 * Per-space booking rules.
 *
 * Rate, deposit, minimum/maximum length and the cleanup buffer started life as
 * a single global setting each (`standard_rate`, `deposit`, …) applied to every
 * space. The Conference Room needs its own numbers ($25/hr, 1 hour minimum,
 * 30-minute buffer), so each of those keys can now be overridden per space:
 *
 *   space_<spaceId>_<key>   e.g. space_conference_standard_rate = "25"
 *
 * An override that is missing or blank falls through to the existing global
 * key, so a space with no overrides behaves exactly as it always has. Capacity
 * is display copy rather than a rule, so it lives in site_content and falls
 * back to the hardcoded value in SPACES.
 */

/** The overridable rules: settings key ↔ the field name callers use. */
export const SPACE_RULE_FIELDS = [
  { key: "standard_rate", field: "rate", fallback: "75" },
  { key: "deposit", field: "deposit", fallback: "150" },
  { key: "minimum_hours", field: "minHours", fallback: "2" },
  { key: "maximum_hours", field: "maxHours", fallback: "8" },
  { key: "cleanup_buffer_minutes", field: "cleanupBufferMinutes", fallback: "60" },
];

/** The settings key holding a space's override for `key`. */
export function spaceSettingKey(spaceId, key) {
  return `space_${spaceId}_${key}`;
}

/** The site_content key holding a space's editable capacity line. */
export function spaceCapacityKey(spaceId) {
  return `space_${spaceId}_capacity`;
}

function isBlank(v) {
  return v === null || v === undefined || String(v).trim() === "";
}

/**
 * Resolve one numeric rule for a space: its own override if set, otherwise the
 * global setting, otherwise the built-in default. An explicit 0 is honoured
 * (a 0-minute cleanup buffer is a legitimate choice).
 */
function resolveNumber(spaceId, key, fallback) {
  const override = spaceId ? getSetting(spaceSettingKey(spaceId, key), null) : null;
  const raw = isBlank(override) ? getSetting(key, fallback) : override;
  const n = Number(isBlank(raw) ? fallback : raw);
  return Number.isFinite(n) ? n : Number(fallback);
}

/** The raw override for a space (blank string when it inherits) — for admin forms. */
export function spaceOverride(spaceId, key) {
  const v = getSetting(spaceSettingKey(spaceId, key), null);
  return isBlank(v) ? "" : String(v);
}

/** The inherited (global) value a space falls back to — for admin placeholders. */
export function globalRule(key, fallback) {
  const v = getSetting(key, fallback);
  return isBlank(v) ? String(fallback) : String(v);
}

/** Owner-editable capacity line, falling back to the value in SPACES. */
export function spaceCapacity(spaceId) {
  const fallback = SPACE_BY_ID[spaceId]?.capacity ?? "";
  return String(getContentValue(spaceCapacityKey(spaceId), fallback) ?? "").trim();
}

/**
 * Effective booking rules for a space:
 * { rate, deposit, minHours, maxHours, cleanupBufferMinutes, capacity }
 */
export function spaceRules(spaceId) {
  const rules = {};
  for (const f of SPACE_RULE_FIELDS) {
    rules[f.field] = resolveNumber(spaceId, f.key, f.fallback);
  }
  rules.capacity = spaceCapacity(spaceId);
  return rules;
}

/** The cleanup buffer for a space, in fractional hours (what the math wants). */
export function spaceBufferHours(spaceId) {
  return resolveNumber(spaceId, "cleanup_buffer_minutes", "60") / 60;
}

/** Every space's rules, keyed by id — handed to the client booking modal. */
export function allSpaceRules() {
  return Object.fromEntries(SPACES.map((s) => [s.id, spaceRules(s.id)]));
}

import { formatDateShort } from "@/lib/constants.js";

/** Where a business stands on the website: { key, label, tone } (tone = a Badge tone). */
export function tenantStatus(t, today) {
  if (Number(t.active) !== 1) return { key: "hidden", label: "Hidden", tone: "neutral" };
  if (t.active_from && t.active_from > today) return { key: "soon", label: `Starts ${formatDateShort(t.active_from)}`, tone: "warning" };
  if (t.active_until && t.active_until < today) return { key: "ended", label: "Ended", tone: "ink" };
  return { key: "live", label: "On the website", tone: "sage" };
}

/** Their main photo, or the first of their photos. */
export function tenantPhoto(t) {
  if (t.photo_path) return t.photo_path;
  try {
    const list = JSON.parse(t.photos || "[]");
    return Array.isArray(list) && list[0] ? list[0] : null;
  } catch {
    return null;
  }
}

/** "Juniper Ceramics" → "JC". */
export function initials(name) {
  return String(name || "?")
    .split(/\s+/)
    .filter((w) => /[a-z0-9]/i.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

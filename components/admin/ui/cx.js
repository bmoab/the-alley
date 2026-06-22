// Tiny classnames helper for the admin UI primitives.
// Accepts strings / falsy values and joins the truthy ones.
export function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

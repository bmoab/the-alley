import { redirect } from "next/navigation";

/**
 * The old "All Requests" archive was merged into /admin/bookings, which now
 * carries the status filters, search and date-range presets it used to own.
 * Kept as a redirect so old links, bookmarks and toast URLs keep working.
 */
export default function AllRequestsPage({ searchParams }) {
  const p = new URLSearchParams();
  for (const k of ["status", "sort", "q", "space", "from", "to", "b"]) {
    const v = searchParams?.[k];
    if (v) p.set(k, String(v));
  }
  // The old page listed everything regardless of date; the merged one defaults
  // to upcoming, so preserve the old behaviour for anyone following a link.
  if (searchParams?.from || searchParams?.to) p.set("preset", "custom");
  else p.set("preset", "all");
  const s = p.toString();
  redirect("/admin/bookings" + (s ? `?${s}` : ""));
}

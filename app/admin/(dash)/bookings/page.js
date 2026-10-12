import { redirect } from "next/navigation";

/**
 * Bookings now live on the Events page, with the calendar and every listing.
 * Old links (emails, bookmarks, the booking sub-pages' "back" buttons) keep
 * working: same filters, same ?b= drawer, same toast.
 */
export default function BookingsPage({ searchParams }) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams || {})) if (typeof v === "string") p.set(k, v);
  const s = p.toString();
  redirect("/admin/events" + (s ? `?${s}` : ""));
}

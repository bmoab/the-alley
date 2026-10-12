import { redirect } from "next/navigation";

/** The calendar is now at the top of the Events page. */
export default function CalendarPage({ searchParams }) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams || {})) if (typeof v === "string") p.set(k, v);
  const s = p.toString();
  redirect("/admin/events" + (s ? `?${s}` : ""));
}

import { redirect } from "next/navigation";

// The public calendar now lives at /calendar (List + Month views). Keep the old
// /events path working by redirecting; event detail pages remain at /events/[id].
export default function EventsPage() {
  redirect("/calendar");
}

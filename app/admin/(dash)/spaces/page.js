import { redirect } from "next/navigation";

// Room photos are edited in Pages → Spaces now, next to the page they show on.
export default function SpacesAdminPage() {
  redirect("/admin/pages/spaces");
}

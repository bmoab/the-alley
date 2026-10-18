import { redirect } from "next/navigation";

// Site photos are edited on the page they appear on, in Pages (live preview).
export default function SitePhotosPage() {
  redirect("/admin/pages/home");
}

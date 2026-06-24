import { redirect } from "next/navigation";

export default function PagesIndex() {
  redirect("/admin/pages/home");
}

import { redirect } from "next/navigation";

// Site Content was split into Descriptors (words) and Site Photos. Keep the old
// path working.
export default function ContentPage() {
  redirect("/admin/descriptors");
}

import { redirect } from "next/navigation";

// Suites are now managed inside Directory (tenant assignment + vacant info).
export default function SuitesPage() {
  redirect("/admin/directory");
}

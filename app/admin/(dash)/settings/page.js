import AdminPlaceholder from "@/components/AdminPlaceholder.js";
export const metadata = { title: "Settings" };
export default function Page() {
  return (
    <AdminPlaceholder
      title="Settings"
      priority={6}
      blurb="Standard rate, minimum hours, deposit, available hours, cleanup buffer, and payment window."
    />
  );
}

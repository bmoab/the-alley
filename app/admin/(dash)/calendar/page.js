import AdminPlaceholder from "@/components/AdminPlaceholder.js";
export const metadata = { title: "Calendar" };
export default function Page() {
  return (
    <AdminPlaceholder
      title="Calendar"
      priority={7}
      blurb="Month view of all held and confirmed bookings plus public events, color-coded by space."
    />
  );
}

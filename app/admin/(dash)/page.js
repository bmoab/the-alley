import { Inbox, Clock, CalendarCheck, Megaphone } from "lucide-react";
import { listBookings } from "@/lib/bookings.js";
import { listLiveEvents } from "@/lib/catalog.js";
import { BOOKING_STATUS } from "@/lib/constants.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import StatCard from "@/components/admin/ui/StatCard.js";

export const metadata = { title: "Dashboard" };

export default function AdminDashboard() {
  const pending = listBookings({ status: BOOKING_STATUS.PENDING });
  const held = listBookings({ status: BOOKING_STATUS.HELD });
  const confirmed = listBookings({ status: BOOKING_STATUS.CONFIRMED });
  const liveEvents = listLiveEvents();

  return (
    <div>
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        subtitle="Everything happening at The Alley, at a glance."
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Pending requests"
          value={pending.length}
          href="/admin/requests"
          hint="Awaiting your review"
          icon={Inbox}
          accent
        />
        <StatCard
          label="Held bookings"
          value={held.length}
          href="/admin/bookings?status=held&preset=all"
          hint="Awaiting payment"
          icon={Clock}
        />
        <StatCard
          label="Confirmed"
          value={confirmed.length}
          href="/admin/bookings?status=confirmed&preset=all"
          hint="Paid & on the calendar"
          icon={CalendarCheck}
        />
        <StatCard
          label="Live events"
          value={new Set(liveEvents.map((e) => e.id)).size}
          href="/admin/events"
          hint="Public listings"
          icon={Megaphone}
        />
      </div>
    </div>
  );
}

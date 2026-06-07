import Link from "next/link";
import { listBookings } from "@/lib/bookings.js";
import { listLiveEvents } from "@/lib/catalog.js";
import { BOOKING_STATUS } from "@/lib/constants.js";

export const metadata = { title: "Dashboard" };

function StatCard({ label, value, href, hint }) {
  return (
    <Link href={href} className="card block p-5 transition hover:border-brass/50">
      <div className="text-3xl font-semibold text-ink">{value}</div>
      <div className="mt-1 text-sm font-semibold text-ink-soft">{label}</div>
      {hint ? <div className="mt-0.5 text-xs text-ink-muted">{hint}</div> : null}
    </Link>
  );
}

export default function AdminDashboard() {
  const pending = listBookings({ status: BOOKING_STATUS.PENDING });
  const held = listBookings({ status: BOOKING_STATUS.HELD });
  const confirmed = listBookings({ status: BOOKING_STATUS.CONFIRMED });
  const liveEvents = listLiveEvents();

  return (
    <div>
      <p className="eyebrow">Overview</p>
      <h1 className="font-display text-3xl font-semibold text-ink">Dashboard</h1>
      <p className="mt-1 text-ink-muted">
        Everything happening at The Alley, at a glance.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Pending requests"
          value={pending.length}
          href="/admin/requests"
          hint="Awaiting your review"
        />
        <StatCard
          label="Held bookings"
          value={held.length}
          href="/admin/bookings"
          hint="Awaiting payment"
        />
        <StatCard
          label="Confirmed"
          value={confirmed.length}
          href="/admin/bookings"
          hint="Paid & on the calendar"
        />
        <StatCard
          label="Live events"
          value={liveEvents.length}
          href="/admin/events"
          hint="Public listings"
        />
      </div>

      <div className="mt-8 card p-6">
        <h2 className="font-display text-xl font-semibold text-ink">
          Build status
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          This prototype is being built in priority order. Sections below come
          online as we go.
        </p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {[
            ["Admin login", true],
            ["Public website + content editing", false],
            ["Booking request flow", false],
            ["Requests: price-adjust & approve", false],
            ["Square invoices (sandbox)", false],
            ["Email templates", false],
            ["Public events system", false],
            ["Deposit refund tracking", false],
          ].map(([label, done]) => (
            <li
              key={label}
              className="flex items-center gap-2 text-sm text-ink-soft"
            >
              <span
                className={
                  done
                    ? "inline-block h-2 w-2 rounded-full bg-brass"
                    : "inline-block h-2 w-2 rounded-full bg-ink/20"
                }
              />
              {label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

import { redirect } from "next/navigation";
import Link from "next/link";
import { getSignedInUser } from "@/lib/auth.js";
import {
  getEmployeeForUser,
  listShifts,
  scheduleContext,
  weekStart,
  weekDates,
} from "@/lib/staff.js";
import { formatDateShort, shiftDate, venueToday } from "@/lib/constants.js";
import ScheduleWeek from "@/components/admin/ScheduleWeek.js";

export const metadata = { title: "Schedule" };

/** The whole team's published week, read-only — who's on with you, and what's on in the building. */
export default async function StaffSchedulePage({ searchParams }) {
  const user = await getSignedInUser();
  if (!user) redirect("/admin/login");
  const employee = getEmployeeForUser(user);
  const today = venueToday();
  const start = weekStart(/^\d{4}-\d{2}-\d{2}$/.test(searchParams?.week || "") ? searchParams.week : today);
  const end = shiftDate(start, { days: 6 });
  const shifts = listShifts({ from: start, to: end, publishedOnly: true });
  const { happenings, closed } = scheduleContext(start, end);

  const nav = "rounded-lg border border-line-strong px-3 py-1.5 text-xs font-semibold text-ink hover:bg-paper-dim";
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={`/staff/schedule?week=${shiftDate(start, { days: -7 })}`} className={nav}>
          ← Prev
        </Link>
        <p className="px-1 text-base font-semibold text-ink">
          {formatDateShort(start)} – {formatDateShort(end)}
        </p>
        <Link href={`/staff/schedule?week=${shiftDate(start, { days: 7 })}`} className={nav}>
          Next →
        </Link>
        {start !== weekStart(today) ? (
          <Link href="/staff/schedule" className={nav}>
            This week
          </Link>
        ) : null}
      </div>
      <ScheduleWeek
        dates={weekDates(start)}
        today={today}
        shifts={shifts}
        happenings={happenings}
        closed={closed}
        highlightEmployeeId={employee?.id ?? null}
      />
      <p className="mt-4 text-xs text-ink-muted">
        Your shifts are outlined. Can&apos;t make one? Talk to your manager — only they can change the schedule.
      </p>
    </div>
  );
}

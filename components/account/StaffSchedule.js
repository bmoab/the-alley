import { Users } from "lucide-react";
import { upcomingStaffSchedule } from "@/lib/staff-schedule.js";
import { fmtRange, fmtDay } from "@/lib/shift-format.js";
import { venueToday, shiftDate } from "@/lib/constants.js";

/**
 * Who's working this week and next, for a tenant who shares the staff cost.
 * Read live from the schedule published in Square; first names and times only.
 */
export default async function StaffSchedule({ wide = true }) {
  const { ok, weeks } = await upcomingStaffSchedule();
  return <StaffScheduleCard ok={ok} weeks={weeks} wide={wide} />;
}

/** The card itself, from upcomingStaffSchedule()'s shape — the account tour passes sample shifts. */
export function StaffScheduleCard({ ok, weeks, wide = true }) {
  const today = venueToday();
  const tomorrow = shiftDate(today, { days: 1 });
  const any = weeks.flat().some((d) => d.shifts.length);
  return (
    <div className={`ac-tile ac-rise ${wide ? "ac-tile--wide" : ""}`}>
      <div className="ac-tile-head">
        <span className="ac-icon">
          <Users aria-hidden="true" />
        </span>
        <div style={{ minWidth: 0 }}>
          <p className="ac-eyebrow">Staff schedule</p>
          <h2 className="ac-tile-title">Who&apos;s working</h2>
        </div>
      </div>
      {!ok ? (
        <p className="ac-tile-body">The schedule can&apos;t be loaded right now. Try again in a few minutes.</p>
      ) : !any ? (
        <p className="ac-tile-body">No shifts are posted for this week or next yet.</p>
      ) : (
        weeks.map((week, i) => (
          <div key={i} className="ac-sched-week">
            <p className="ac-eyebrow">{i === 0 ? "This week" : "Next week"}</p>
            <ul className="ac-rows">
              {week.map((d) => (
                <li key={d.date} className="ac-sched-day">
                  <span className={`ac-sched-date${d.date === today ? " is-today" : ""}`}>
                    {d.date === today ? "Today" : d.date === tomorrow ? "Tomorrow" : fmtDay(d.date)}
                  </span>
                  {d.shifts.length ? (
                    <span className="ac-sched-shifts">
                      {d.shifts.map((s, j) => (
                        <span key={j} className="ac-sched-shift">
                          <b>{s.name}</b> {fmtRange(s.start, s.end)}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="ac-sched-none">No one scheduled</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
      <p className="ac-sched-foot">From the schedule in Square. Changes show here once they&apos;re published.</p>
    </div>
  );
}

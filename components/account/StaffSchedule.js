import { Users } from "lucide-react";
import { upcomingStaffSchedule } from "@/lib/staff-schedule.js";
import { fmtRange, fmtTime } from "@/lib/shift-format.js";
import { venueToday, shiftDate } from "@/lib/constants.js";

/**
 * Who's working this week and next, for a tenant who shares the staff cost.
 * Read live from the schedule published in Square; first names and times only.
 */
export default async function StaffSchedule({ wide = true }) {
  const { ok, weeks } = await upcomingStaffSchedule();
  return <StaffScheduleCard ok={ok} weeks={weeks} wide={wide} />;
}

// One colour per person, in the order they first appear — soft enough to sit
// in the account's verde-and-ink look, distinct enough to tell apart.
const COLORS = [
  { bg: "#dfe6cf", bar: "#8a9472" },
  { bg: "#f1e0cf", bar: "#c08a5b" },
  { bg: "#d9e4ec", bar: "#6f8fa6" },
  { bg: "#efdbe0", bar: "#b5838d" },
  { bg: "#f1e8c8", bar: "#bf9d3e" },
  { bg: "#e3dcef", bar: "#7d6e9a" },
];
const OPEN = { bg: "transparent", bar: "#a5a59d" };

const hours = (hhmm) => {
  const [h, m] = String(hhmm || "0:0").split(":").map(Number);
  return h + (m || 0) / 60;
};

/** Shifts on separate lanes wherever they overlap, so no bar hides another. */
function lanes(shifts) {
  const ends = [];
  return shifts
    .map((s) => ({ ...s, a: hours(s.start), b: s.end ? hours(s.end) : hours(s.start) + 4 }))
    .sort((x, y) => x.a - y.a)
    .map((s) => {
      let lane = ends.findIndex((e) => e <= s.a);
      if (lane === -1) lane = ends.length;
      ends[lane] = s.b;
      return { ...s, lane };
    });
}

/** "4pm–8pm" → "4–8pm": the same-half "pm" once, so it fits a short bar. */
function shortRange(start, end) {
  const r = fmtRange(start, end);
  const m = /^(\d+(?::\d+)?)(am|pm)–(\d+(?::\d+)?)(am|pm)$/.exec(r);
  return m && m[2] === m[4] ? `${m[1]}–${m[3]}${m[4]}` : r;
}

function dayLabel(date, today, tomorrow) {
  const d = new Date(`${date}T12:00:00`);
  const md = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (date === today) return ["Today", md];
  if (date === tomorrow) return ["Tomorrow", md];
  return [d.toLocaleDateString("en-US", { weekday: "short" }), md];
}

/**
 * The card itself, from upcomingStaffSchedule()'s shape — the account tour
 * passes sample shifts. Each day is a row on one shared clock, with a bar for
 * each shift, so a glance shows who's in and when.
 */
export function StaffScheduleCard({ ok, weeks, wide = true }) {
  const today = venueToday();
  const tomorrow = shiftDate(today, { days: 1 });
  const all = weeks.flat().flatMap((d) => d.shifts);
  const any = all.length > 0;

  // The clock: from the earliest start to the latest end, on whole hours.
  let from = Math.floor(Math.min(...all.map((s) => hours(s.start)), 10));
  let to = Math.ceil(Math.max(...all.map((s) => (s.end ? hours(s.end) : hours(s.start) + 4)), 18));
  if (to - from < 6) to = from + 6;
  const span = to - from;
  const pct = (h) => `${((h - from) / span) * 100}%`;
  const step = span > 10 ? 3 : 2;
  const ticks = [];
  for (let h = Math.ceil(from / step) * step; h <= to; h += step) ticks.push(h);

  const people = [...new Set(all.filter((s) => s.name !== "Open shift").map((s) => s.name))];
  const colorOf = (name) => (name === "Open shift" ? OPEN : COLORS[people.indexOf(name) % COLORS.length]);

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
        <>
          <ul className="ac-sched-legend" aria-label="Who's who">
            {people.map((p) => (
              <li key={p}>
                <span style={{ background: colorOf(p).bar }} aria-hidden="true" />
                {p}
              </li>
            ))}
          </ul>
          {weeks.map((week, i) =>
            week.length ? (
              <section key={i} className="ac-sched-week">
                <div className="ac-sched-head">
                  <p className="ac-eyebrow">{i === 0 ? "This week" : "Next week"}</p>
                  <div className="ac-sched-axis" aria-hidden="true">
                    {ticks.map((h) => (
                      <span key={h} style={{ left: pct(h) }} className={h === from ? "is-first" : h === to ? "is-last" : undefined}>
                        {fmtTime(`${h}:00`)}
                      </span>
                    ))}
                  </div>
                </div>
                {week.map((d) => {
                  const [big, small] = dayLabel(d.date, today, tomorrow);
                  const placed = lanes(d.shifts);
                  const n = Math.max(1, ...placed.map((s) => s.lane + 1));
                  return (
                    <div key={d.date} className={`ac-sched-row${d.date === today ? " is-today" : ""}`}>
                      <p className="ac-sched-date">
                        <b>{big}</b>
                        <span>{small}</span>
                      </p>
                      <div className="ac-sched-track" style={{ height: n * 30 + 8 }}>
                        {ticks.map((h) => (
                          <i key={h} className="ac-sched-tick" style={{ left: pct(h) }} aria-hidden="true" />
                        ))}
                        {placed.length ? (
                          placed.map((s, j) => {
                            const c = colorOf(s.name);
                            return (
                              <span
                                key={j}
                                className={`ac-sched-bar${s.name === "Open shift" ? " is-open" : ""}`}
                                title={`${s.name} · ${fmtRange(s.start, s.end)}`}
                                style={{
                                  left: pct(s.a),
                                  width: `calc(${((s.b - s.a) / span) * 100}% - 2px)`,
                                  top: 4 + s.lane * 30,
                                  background: c.bg,
                                  borderColor: c.bar,
                                }}
                              >
                                <b>{s.name}</b> <span>{shortRange(s.start, s.end)}</span>
                              </span>
                            );
                          })
                        ) : (
                          <span className="ac-sched-none">No one scheduled</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </section>
            ) : null
          )}
        </>
      )}
      <p className="ac-sched-foot">From the schedule in Square. Changes show here once they&apos;re published.</p>
    </div>
  );
}

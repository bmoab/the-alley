"use client";

import { useMemo, useState } from "react";
import { CalendarCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { SubscribeButtons } from "./CalendarSubscribe.js";
import { fmtRange } from "@/lib/shift-format.js";
import { shiftDate } from "@/lib/constants.js";

/**
 * Alley Reservations on an account: a little month calendar of every booking
 * in the building, for a business switched on to see them (the cleaner).
 * Dots mark busy days; tapping a day lists what's on it. Takes
 * listReservations()'s rows (this month and the next two), today's date, and
 * the private feed address for putting it on a phone calendar too.
 */

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

const monthOf = (ymd) => ymd.slice(0, 7);
const parse = (ymd) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const monthName = (ym) => parse(`${ym}-01`).toLocaleDateString("en-US", { month: "long", year: "numeric" });

function dayLabel(date, today) {
  const md = parse(date).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }).replace(",", "");
  if (date === today) return `Today · ${md}`;
  if (date === shiftDate(today, { days: 1 })) return `Tomorrow · ${md}`;
  return md;
}

/** The weeks of a month as rows of seven YYYY-MM-DD (null outside the month). */
function weeksOf(ym) {
  const first = parse(`${ym}-01`);
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells = Array(first.getDay()).fill(null);
  for (let d = 1; d <= days; d++) cells.push(`${ym}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export default function ReservationsCard({ rows = [], today, months = 3, feedUrl = null, wide = true }) {
  const byDate = useMemo(() => {
    const m = {};
    for (const r of rows) (m[r.date] ||= []).push(r);
    return m;
  }, [rows]);

  const firstMonth = monthOf(today);
  const monthList = Array.from({ length: months }, (_, i) => monthOf(shiftDate(`${firstMonth}-01`, { months: i })));
  const [mi, setMi] = useState(0);
  const [picked, setPicked] = useState(today);
  const ym = monthList[mi];
  const dayRows = byDate[picked] || [];

  const go = (step) => {
    const next = mi + step;
    setMi(next);
    // Land on today in this month, else the month's first busy day, else the 1st.
    const m = monthList[next];
    const busy = Object.keys(byDate).sort().find((d) => monthOf(d) === m && d >= today);
    setPicked(m === firstMonth ? today : busy || `${m}-01`);
  };

  return (
    <div className={`ac-tile ac-rise ${wide ? "ac-tile--wide" : ""}`}>
      <div className="ac-tile-head">
        <span className="ac-icon">
          <CalendarCheck aria-hidden="true" />
        </span>
        <div style={{ minWidth: 0 }}>
          <p className="ac-eyebrow">Every booking in the building</p>
          <h2 className="ac-tile-title">Alley Reservations</h2>
        </div>
      </div>
      <p className="ac-tile-body">
        Public and private. Tap a day to see what&apos;s on. Room times include the renter&apos;s setup and cleanup.
      </p>

      <div className="ac-cal">
        <div className="ac-cal-bar">
          <button type="button" className="ac-cal-nav" onClick={() => go(-1)} disabled={mi === 0} aria-label="Previous month">
            <ChevronLeft aria-hidden="true" />
          </button>
          <p className="ac-cal-month" aria-live="polite">
            {monthName(ym)}
          </p>
          <button
            type="button"
            className="ac-cal-nav"
            onClick={() => go(1)}
            disabled={mi === monthList.length - 1}
            aria-label="Next month"
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
        <div className="ac-cal-grid" role="grid" aria-label={`${monthName(ym)} reservations`}>
          {WEEKDAYS.map((d, i) => (
            <span key={i} className="ac-cal-wd" aria-hidden="true">
              {d}
            </span>
          ))}
          {weeksOf(ym).flat().map((date, i) => {
            if (!date) return <span key={`x${i}`} className="ac-cal-cell is-blank" />;
            const list = byDate[date] || [];
            const cls = [
              "ac-cal-cell",
              date === today ? "is-today" : "",
              date === picked ? "is-picked" : "",
              date < today ? "is-past" : "",
              list.length ? "is-busy" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <button
                key={date}
                type="button"
                className={cls}
                onClick={() => setPicked(date)}
                aria-pressed={date === picked}
                aria-label={`${dayLabel(date, today)}: ${list.length ? `${list.length} booked` : "nothing booked"}`}
              >
                <span className="ac-cal-num">{Number(date.slice(8))}</span>
                <span className="ac-cal-dots" aria-hidden="true">
                  {list.slice(0, 3).map((r) => (
                    <i key={r.key} className={r.isPublic ? "is-public" : ""} />
                  ))}
                  {list.length > 3 ? <b>+{list.length - 3}</b> : null}
                </span>
              </button>
            );
          })}
        </div>
        <p className="ac-cal-key" aria-hidden="true">
          <span>
            <i className="is-public" /> Public
          </span>
          <span>
            <i /> Private
          </span>
        </p>
      </div>

      <section className={`ac-res-day${picked === today ? " is-today" : ""}`}>
        <p className="ac-res-date">{dayLabel(picked, today)}</p>
        {dayRows.length ? (
          <ul className="ac-rows">
            {dayRows.map((r) => (
              <li key={r.key} className="ac-res-row">
                <span className="ac-row-main">
                  <span className="ac-row-title">{r.title}</span>
                  <span className="ac-row-sub">
                    {[
                      r.space,
                      r.start ? `Room ${fmtRange(r.start, r.end)}` : "No time set yet",
                      r.guestStart ? `Guests ${fmtRange(r.guestStart, r.guestEnd)}` : null,
                      r.guests ? `${r.guests} guests` : null,
                      r.kind && !r.isPublic ? r.kind : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="ac-res-pills">
                  {r.alcohol ? <span className="ac-pill ac-pill--wait">Alcohol</span> : null}
                  {r.unconfirmed ? <span className="ac-pill">Not paid yet</span> : null}
                  <span className={`ac-pill${r.isPublic ? " ac-pill--live" : ""}`}>{r.isPublic ? "Public" : "Private"}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ac-small" style={{ margin: "10px 0 0" }}>
            Nothing booked.
          </p>
        )}
      </section>

      {feedUrl ? (
        <>
          <p className="ac-small" style={{ margin: "4px 0 0" }}>
            Want these on your phone too? Your calendar keeps itself up to date, a year ahead, and cancelled bookings drop off
            on their own. This link is just for you, so please don&apos;t share it.
          </p>
          <SubscribeButtons feedUrl={feedUrl} calName="Alley Reservations" />
        </>
      ) : null}
    </div>
  );
}

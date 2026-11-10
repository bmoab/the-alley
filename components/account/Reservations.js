import { CalendarCheck } from "lucide-react";
import { SubscribeButtons } from "./CalendarSubscribe.js";
import { fmtRange } from "@/lib/shift-format.js";
import { venueToday, shiftDate } from "@/lib/constants.js";

/**
 * Alley Reservations on an account: every booking in the building for the next
 * few weeks, by day — for a business switched on to see them (the cleaner).
 * Takes listReservations()'s rows and the private feed address; the account
 * tour can pass samples.
 */

function dayLabel(date, today) {
  const d = new Date(`${date}T12:00:00`);
  const md = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).replace(",", "");
  if (date === today) return `Today · ${md}`;
  if (date === shiftDate(today, { days: 1 })) return `Tomorrow · ${md}`;
  return md;
}

export default function ReservationsCard({ rows = [], feedUrl = null, weeks = 3, wide = true }) {
  const today = venueToday();
  const byDay = [];
  for (const r of rows) {
    const last = byDay[byDay.length - 1];
    if (last && last.date === r.date) last.rows.push(r);
    else byDay.push({ date: r.date, rows: [r] });
  }

  return (
    <div className={`ac-tile ac-rise ${wide ? "ac-tile--wide" : ""}`}>
      <div className="ac-tile-head">
        <span className="ac-icon">
          <CalendarCheck aria-hidden="true" />
        </span>
        <div style={{ minWidth: 0 }}>
          <p className="ac-eyebrow">Next {weeks} weeks</p>
          <h2 className="ac-tile-title">Alley Reservations</h2>
        </div>
      </div>
      <p className="ac-tile-body">
        Everything booked in the building, public and private. Room times include the renter&apos;s setup and cleanup.
      </p>

      {byDay.length ? (
        <div className="ac-res">
          {byDay.map((day) => (
            <section key={day.date} className={`ac-res-day${day.date === today ? " is-today" : ""}`}>
              <p className="ac-res-date">{dayLabel(day.date, today)}</p>
              <ul className="ac-rows">
                {day.rows.map((r) => (
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
            </section>
          ))}
        </div>
      ) : (
        <p className="ac-small" style={{ margin: 0 }}>Nothing is booked in the next {weeks} weeks.</p>
      )}

      {feedUrl ? (
        <>
          <p className="ac-small" style={{ margin: "4px 0 0" }}>
            Put these on your phone. Your calendar keeps itself up to date, a year ahead, and cancelled bookings drop off on
            their own. This link is just for you, so please don&apos;t share it.
          </p>
          <SubscribeButtons feedUrl={feedUrl} calName="Alley Reservations" />
        </>
      ) : null}
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";

/**
 * Date + start-time picker for the admin "Change date" page.
 *
 * Deliberately NOT the site's CalendarPick/SmartTime: those are styled by the
 * bk-* rules in app/(site)/site.css, which the admin tree never loads, so they'd
 * render as unstyled boxes here. A native date input plus a start-time select is
 * also the right density for an admin tool.
 *
 * Start times come from /api/availability with `exclude=<id>` so the booking
 * being moved doesn't block its own slot — "same day, two hours earlier" works.
 */
export default function AdminReschedulePicker({ booking }) {
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [start, setStart] = useState("");

  useEffect(() => {
    if (!date) { setSlots([]); setStart(""); return; }
    let alive = true;
    setLoading(true);
    fetch(
      `/api/availability?space=${booking.space}&date=${date}&hours=${booking.hours}&exclude=${booking.id}`
    )
      .then((r) => r.json())
      .then((d) => { if (alive) setSlots(d.slots || []); })
      .catch(() => { if (alive) setSlots([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [date, booking.space, booking.hours, booking.id]);

  const open = slots.filter((s) => s.available);

  return (
    <div className="space-y-4">
      <div>
        <label className="label" htmlFor="date">New date</label>
        <input
          id="date"
          name="date"
          type="date"
          required
          value={date}
          onChange={(e) => { setDate(e.target.value); setStart(""); }}
          className="field"
        />
      </div>

      <div>
        <label className="label" htmlFor="start_time">New start time</label>
        <select
          id="start_time"
          name="start_time"
          required
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="field"
          disabled={!date || loading}
        >
          <option value="">
            {!date ? "Pick a date first" : loading ? "Checking availability…" : open.length ? "Choose a start time" : "Nothing open that day"}
          </option>
          {open.map((s) => (
            <option key={s.time} value={s.time}>{s.time}</option>
          ))}
        </select>
        {date && !loading ? (
          <p className="mt-1 text-xs text-ink-muted">
            {open.length
              ? `${open.length} open start ${open.length === 1 ? "time" : "times"} for a ${booking.hours}-hour booking (cleanup buffer included).`
              : "Every slot that day is taken, closed, or too short for this booking."}
          </p>
        ) : null}
      </div>
    </div>
  );
}

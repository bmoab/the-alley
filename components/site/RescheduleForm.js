"use client";
import { useEffect, useState } from "react";
import { CalendarPick, SmartTime, earliestStartFracFor } from "@/components/site/DayTimePicker.js";
import { labStyle } from "@/components/site/field-styles.js";

/**
 * The client-facing "change my date" picker.
 *
 * Only the day and start time can move — space, length and price are fixed, so
 * SmartTime runs with `fixedHours` and never offers a duration or a new price.
 * Everything here is a UI convenience: the server re-checks the notice window,
 * the conflict and the move cap on submit, keyed off the URL token rather than
 * anything this component posts.
 */
export default function RescheduleForm({ booking, config, minDate, onSubmit }) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState({ start: "", hours: booking.hours });
  const [dayCounts, setDayCounts] = useState({});
  const [dayBookings, setDayBookings] = useState([]);
  const [dayClosures, setDayClosures] = useState([]);
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);

  const q = `space=${booking.space}&exclude=${booking.id}`;

  // Month availability dots.
  useEffect(() => {
    const month = `${monthCursor.y}-${String(monthCursor.m + 1).padStart(2, "0")}`;
    let alive = true;
    fetch(`/api/availability?${q}&month=${month}&hours=${booking.hours}`)
      .then((r) => r.json())
      .then((d) => { if (alive && d.days) setDayCounts((prev) => ({ ...prev, ...d.days })); })
      .catch(() => {});
    return () => { alive = false; };
  }, [monthCursor, booking.hours, q]);

  // The chosen day's existing bookings + closures, for the start-time chips.
  useEffect(() => {
    if (!date) return;
    let alive = true;
    fetch(`/api/availability?${q}&date=${date}&bookings=1`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setDayBookings(d.bookings || []);
        setDayClosures(d.closures || []);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [date, q]);

  if (done) {
    return (
      <div className="rs-done">
        <p className="eyebrow">All set</p>
        <h2 className="rs-h2">Your booking has moved.</h2>
        <div className="rs-recap">
          <div>
            <span className="rs-lbl mono">Was</span>
            <s>{done.wasDate} · {done.wasTime}</s>
          </div>
          <div>
            <span className="rs-lbl mono">Now</span>
            <strong>{done.nowDate} · {done.nowTime}</strong>
          </div>
        </div>
        <p className="rs-note">
          We&rsquo;ve emailed you a confirmation. Same space, same {booking.hours} hours,
          same price — there&rsquo;s nothing more to pay.
        </p>
      </div>
    );
  }

  const submit = async () => {
    setError("");
    setBusy(true);
    const res = await onSubmit({ date, start_time: time.start });
    setBusy(false);
    if (res?.ok) setDone(res.moved);
    else setError(res?.error || "That change couldn't be made.");
  };

  const minStartFrac = earliestStartFracFor(date, config.minLeadHours || 0);

  return (
    <div className="rs-form">
      <div className="rs-block">
        <span style={labStyle}>Choose a new day</span>
        <CalendarPick
          value={date}
          onPick={(d) => { setDate(d); setTime({ start: "", hours: booking.hours }); }}
          space={booking.space}
          hours={booking.hours}
          dayCounts={dayCounts}
          monthCursor={monthCursor}
          onMonthChange={setMonthCursor}
          minDate={minDate}
        />
      </div>

      {date ? (
        <div className="rs-block">
          <SmartTime
            config={config}
            bookings={dayBookings}
            closures={dayClosures}
            value={time}
            onChange={setTime}
            minStartFrac={minStartFrac}
            fixedHours={booking.hours}
          />
        </div>
      ) : null}

      {error ? <p className="rs-error">{error}</p> : null}

      <div className="rs-actions">
        <button
          type="button"
          className="btn btn--solid"
          disabled={!date || !time.start || busy}
          onClick={submit}
        >
          {busy ? "Moving…" : "Confirm the new date"}
        </button>
        {date && time.start ? (
          <p className="rs-note">
            Moving to <strong>{date}</strong> at <strong>{time.start}</strong> · still {booking.hours} hours.
          </p>
        ) : (
          <p className="rs-note">Pick a day and a start time to continue.</p>
        )}
      </div>
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import Select from "@/components/admin/ui/Select.js";
import { formatTime, formatMoney } from "@/lib/constants.js";

/**
 * Date, start time and length for the admin "Change date or time" page.
 *
 * Deliberately NOT the site's CalendarPick/SmartTime: those are styled by the
 * bk-* rules in app/(site)/site.css, which the admin tree never loads, so they'd
 * render as unstyled boxes here. A native date input plus selects is also the
 * right density for an admin tool.
 *
 * Starts on the booking's own date, time and length, so adding an hour is one
 * change. Start times come from /api/availability with `exclude=<id>` so the
 * booking doesn't block its own slot. When the length changes it says what
 * happens to the money before anything is saved.
 *
 * booking: { id, space, hours, date, start_time, rate, paid, hasInvoice, series }
 * lengths: the hour counts to offer.
 */
const addHours = (hhmm, h) => {
  const [hh, mm] = hhmm.split(":").map(Number);
  const t = hh * 60 + mm + Math.round(h * 60);
  return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};
const hrs = (h) => `${h} ${h === 1 ? "hour" : "hours"}`;

export default function AdminReschedulePicker({ booking, lengths }) {
  const [date, setDate] = useState(booking.date);
  const [hours, setHours] = useState(Number(booking.hours));
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [start, setStart] = useState(booking.start_time);

  useEffect(() => {
    if (!date) { setSlots([]); return; }
    let alive = true;
    setLoading(true);
    fetch(`/api/availability?space=${booking.space}&date=${date}&hours=${hours}&exclude=${booking.id}`)
      .then((r) => r.json())
      .then((d) => { if (alive) setSlots(d.slots || []); })
      .catch(() => { if (alive) setSlots([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [date, hours, booking.space, booking.id]);

  const open = slots.filter((s) => s.available);
  // Keep the chosen start if it still works; otherwise ask again.
  const startOk = !loading && open.some((s) => s.time === start);
  useEffect(() => {
    if (!loading && start && slots.length && !open.some((s) => s.time === start)) setStart("");
  }, [loading, slots]); // eslint-disable-line react-hooks/exhaustive-deps

  const diffHours = hours - Number(booking.hours);
  const diff = Math.round(booking.rate * diffHours * 100) / 100;

  let money = null;
  if (diffHours !== 0 && booking.series) {
    money = { tone: "warn", text: "A recurring session's length can't be changed here yet — only its date and start time." };
  } else if (diffHours !== 0 && diff === 0) {
    money = { tone: "ok", text: "This booking is free, so there's nothing to charge or refund." };
  } else if (diffHours > 0 && booking.paid) {
    money = { tone: "ok", text: `${hrs(diffHours)} more is ${formatMoney(diff)}. They've already paid, so they'll get a separate Square invoice for ${formatMoney(diff)}, with the link in the email below.` };
  } else if (diffHours < 0 && booking.paid) {
    money = { tone: "ok", text: `${hrs(-diffHours)} less is ${formatMoney(-diff)} back.`, refund: true };
  } else if (diffHours !== 0 && booking.hasInvoice) {
    money = { tone: "ok", text: `The new total is ${formatMoney(booking.total + diff)} (${diff > 0 ? "+" : "–"}${formatMoney(Math.abs(diff))}). They haven't paid yet, so their invoice is replaced with one for the new total and the old link stops working.` };
  } else if (diffHours !== 0) {
    money = { tone: "ok", text: `The new total is ${formatMoney(booking.total + diff)}.` };
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="date">Date</label>
          <input
            id="date"
            name="date"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="field"
          />
        </div>
        <div>
          <label className="label" htmlFor="start_time">Start time</label>
          <Select
            id="start_time"
            name="start_time"
            required
            value={startOk ? start : ""}
            onChange={setStart}
            disabled={!date || loading}
          >
            <option value="">
              {!date ? "Pick a date first" : loading ? "Checking…" : open.length ? "Choose a start time" : "Nothing open that day"}
            </option>
            {open.map((s) => (
              <option key={s.time} value={s.time}>{formatTime(s.time)}</option>
            ))}
          </Select>
        </div>
        <div>
          <label className="label" htmlFor="hours">How long</label>
          <Select id="hours" name="hours" value={String(hours)} onChange={(v) => setHours(Number(v))}>
            {lengths.map((h) => (
              <option key={h} value={String(h)}>{hrs(h)}{h === Number(booking.hours) ? " (now)" : ""}</option>
            ))}
          </Select>
        </div>
      </div>

      {date && !loading ? (
        <p className="text-sm text-ink-muted">
          {startOk
            ? <>Runs <strong className="text-ink">{formatTime(start)}–{formatTime(addHours(start, hours))}</strong>. The cleanup buffer after it is checked too.</>
            : open.length
              ? `${open.length} open start ${open.length === 1 ? "time" : "times"} for ${hrs(hours)}.`
              : `Every slot that day is taken, closed, or too short for ${hrs(hours)}.`}
        </p>
      ) : null}

      {money ? (
        <div className={`rounded-2xl border px-4 py-3 text-sm ${money.tone === "warn" ? "border-rust/30 bg-rust/5 text-rust" : "border-line bg-paper text-ink"}`}>
          <p>{money.text}</p>
          {money.refund ? (
            <label className="mt-2 flex items-start gap-2">
              <input type="checkbox" name="refund" value="1" defaultChecked className="mt-1" />
              <span>Refund {formatMoney(-diff)} to how they paid.</span>
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

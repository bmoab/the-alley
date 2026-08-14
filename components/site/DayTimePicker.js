"use client";
import { useState } from "react";
import { labStyle } from "@/components/site/field-styles.js";

/**
 * The booking date + time pickers, shared by the booking modal and the
 * client-facing reschedule page.
 *
 * ⚠️ These render with `bk-*` classes defined in app/(site)/site.css, which is
 * imported ONLY by app/(site)/layout.js. They will render unstyled anywhere
 * outside the (site) route group — notably the admin tree, which never loads
 * that stylesheet. Keep consumers inside app/(site)/.
 */

export const pad2 = (n) => String(n).padStart(2, "0");
export const ymd = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`;

/**
 * Earliest bookable start (fractional hour-of-day) for `dateStr`, given the
 * advance-notice window. null = no restriction; 24 = whole day too soon. Greys
 * past + too-soon start chips in SmartTime; the server is authoritative.
 */
export function earliestStartFracFor(dateStr, leadHours = 0) {
  if (!dateStr) return null;
  const cutoff = new Date(Date.now() + (Number(leadHours) || 0) * 3600 * 1000);
  const cutoffDate = ymd(cutoff.getFullYear(), cutoff.getMonth(), cutoff.getDate());
  if (dateStr > cutoffDate) return null;
  if (dateStr < cutoffDate) return 24;
  return cutoff.getHours() + cutoff.getMinutes() / 60;
}

/** Month calendar with availability dots fed by /api/availability?month=. */
export function CalendarPick({
  value,
  onPick,
  space,
  hours,
  dayCounts,
  monthCursor,
  onMonthChange,
  // Earliest selectable day as YYYY-MM-DD. Used by the reschedule page to grey
  // out everything inside the notice window, so a client sees the boundary
  // instead of clicking a date and being told no.
  minDate = null,
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const { y, m } = monthCursor;
  const first = new Date(y, m, 1);
  const startDow = first.getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const label = first.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  const shift = (delta) => {
    const mm = m + delta;
    onMonthChange({ y: y + Math.floor(mm / 12), m: ((mm % 12) + 12) % 12 });
  };
  const atMonthStart = y === today.getFullYear() && m === today.getMonth();

  return (
    <div className="bk-cal">
      <div className="bk-cal-head">
        <button type="button" className="bk-cal-nav" onClick={() => shift(-1)} disabled={atMonthStart} aria-label="Previous month">‹</button>
        <span className="bk-cal-month mono">{label}</span>
        <button type="button" className="bk-cal-nav" onClick={() => shift(1)} aria-label="Next month">›</button>
      </div>
      <div className="bk-cal-dow">{["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <span key={i}>{d}</span>)}</div>
      <div className="bk-cal-grid">
        {cells.map((d, i) => {
          if (!d) return <span key={i} className="bk-cal-cell bk-cal-cell--empty" />;
          const ds = ymd(y, m, d);
          const date = new Date(y, m, d);
          // A day before `minDate` is treated exactly like a past day: greyed,
          // undotted and unclickable.
          const past = date < today || (minDate != null && ds < minDate);
          const isSel = value === ds;
          const isToday = date.getTime() === today.getTime();
          const open = past ? 0 : dayCounts[ds] ?? null;
          const cls =
            "bk-cal-cell" +
            (past ? " is-past" : "") +
            (isSel ? " is-sel" : "") +
            (isToday ? " is-today" : "") +
            (!past && open === 0 ? " is-full" : "");
          return (
            <button
              key={i}
              type="button"
              className={cls}
              disabled={past || open === 0}
              onClick={() => onPick(ds)}
              title={past ? "" : open === 0 ? "Fully booked" : open == null ? "" : open + " open start times"}
            >
              <span className="bk-cal-d">{d}</span>
              {!past && open != null ? (
                <span className="bk-cal-dot" data-open={open === 0 ? "0" : open < 4 ? "low" : "ok"} />
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="bk-cal-legend mono">
        <span><i className="bk-dot bk-dot--ok" /> Open</span>
        <span><i className="bk-dot bk-dot--low" /> Limited</span>
        <span><i className="bk-dot bk-dot--0" /> Full</span>
      </div>
    </div>
  );
}



/** Fractional hour (e.g. 14.5) → "HH:MM". */
function fracToHHMM(v) {
  const h = Math.floor(v);
  const m = v % 1 === 0.5 ? "30" : "00";
  return `${pad2(h)}:${m}`;
}
/** "HH:MM" → fractional hour. */
function hhmmToFrac(s) {
  const [h, m] = s.split(":").map(Number);
  return h + (m >= 30 ? 0.5 : 0);
}
/** Fractional hour → "2:00 PM". */
function fmtFrac(v) {
  const base = Math.floor(v);
  const min = v % 1 === 0.5 ? ":30" : ":00";
  const period = base < 12 ? "AM" : "PM";
  let disp = base % 12;
  if (disp === 0) disp = 12;
  return `${disp}${min} ${period}`;
}

/**
 * Smart time selection: tappable start chips with a :00/:30 toggle, then
 * duration chips (end time is computed). Greys out start times taken by existing
 * bookings (incl. cleanup buffer) and caps duration at whichever comes first —
 * closing time or the next booking's cleanup buffer.
 *
 * `value` = { start: "HH:MM"|"", hours: number|null }. `bookings` = raw
 * [{ start, end }] fractional-hour intervals (buffer applied here).
 *
 * `fixedHours` locks the duration (used when rescheduling an existing booking,
 * where only the day and start may move): the duration chips and price bar are
 * hidden, and a start whose available run is shorter than `fixedHours` is
 * greyed out rather than offered and then rejected.
 */
export function SmartTime({
  config,
  bookings,
  closures,
  value,
  onChange,
  minStartFrac = null,
  fixedHours = null,
}) {
  const { rate, deposit, minHours, openHour, closeHour, cleanupBuffer, maxHours } = config;
  const maxH = maxHours || 24; // configurable maximum booking length (hours)
  const list = bookings || [];
  const closed = closures || [];
  const startVal = value.start ? hhmmToFrac(value.start) : null;

  const [mode, setMode] = useState(startVal != null && startVal % 1 === 0.5 ? 30 : 0);

  // A start is taken if it falls inside a booking (+ buffer on both sides) or a
  // closure (hard block, no buffer).
  const isStartTaken = (val) =>
    list.some((b) => val >= b.start - cleanupBuffer && val < b.end + cleanupBuffer) ||
    closed.some((c) => val >= c.start && val < c.end);

  // Max hours before the next booking (− buffer) or closure (no buffer) or close.
  const maxDurationFrom = (start) => {
    let limit = closeHour - start;
    list.forEach((b) => {
      if (b.start > start) limit = Math.min(limit, b.start - cleanupBuffer - start);
    });
    closed.forEach((c) => {
      if (c.start > start) limit = Math.min(limit, c.start - start);
    });
    return Math.min(Math.floor(limit), maxH);
  };

  // Whole operating day closed?
  const fullyClosed = closed.some((c) => c.start <= openHour && c.end >= closeHour);
  if (fullyClosed) {
    return <p className="bk-times-hint bk-times-none">The Alley is closed this day — please pick another date.</p>;
  }

  // With the duration locked, a start only works if the whole booking fits.
  const tooShortFor = (val) => fixedHours != null && maxDurationFrom(val) < fixedHours;

  // Start chips for the current :00 / :30 set.
  const need = fixedHours != null ? fixedHours : minHours;
  const offset = mode === 30 ? 0.5 : 0;
  const starts = [];
  for (let h = openHour; h <= closeHour - need; h++) {
    const val = h + offset;
    if (val > closeHour - need) continue;
    starts.push(val);
  }

  const pickStart = (val) => {
    if (fixedHours != null) {
      onChange({ start: fracToHHMM(val), hours: fixedHours });
      return;
    }
    const md = maxDurationFrom(val);
    const keep = value.hours && value.hours <= md ? value.hours : null;
    onChange({ start: fracToHHMM(val), hours: keep });
  };

  const toggleMode = (m) => {
    setMode(m);
    if (startVal != null && (startVal % 1 === 0.5) !== (m === 30)) {
      onChange({ start: "", hours: null });
    }
  };

  // Duration chips (only after a start is chosen).
  let durChips = null;
  let note = null;
  if (startVal != null) {
    const md = maxDurationFrom(startVal);
    const closeMax = Math.min(Math.floor(closeHour - startVal), maxH);
    const durations = [];
    for (let d = minHours; d <= closeMax; d++) durations.push(d);
    durChips = durations.map((d) => {
      const blocked = d > md;
      const selected = value.hours === d;
      return (
        <button
          key={d}
          type="button"
          className={"bk-chip" + (selected ? " is-sel" : "") + (blocked ? " is-disabled" : "")}
          disabled={blocked}
          onClick={() => onChange({ start: value.start, hours: d })}
        >
          {d} hr{d > 1 ? "s" : ""}
        </button>
      );
    });
    const nextB = list.filter((b) => b.start > startVal).sort((a, b) => a.start - b.start)[0];
    if (nextB && md < closeMax) {
      note = `Max ${md} hrs from ${fmtFrac(startVal)} — next booking at ${fmtFrac(nextB.start)} needs a ${cleanupBuffer} hr cleanup buffer before it.`;
    } else {
      note = `Max ${closeMax} hrs from ${fmtFrac(startVal)} — we close at ${fmtFrac(closeHour)}.`;
    }
  }

  const total = startVal != null && value.hours ? rate * value.hours + deposit : 0;

  return (
    <>
      <div className="bk-fieldhead">
        <span style={labStyle}>Start time</span>
        <div className="bk-seg">
          <button type="button" className={mode === 0 ? "is-on" : ""} onClick={() => toggleMode(0)}>:00</button>
          <button type="button" className={mode === 30 ? "is-on" : ""} onClick={() => toggleMode(30)}>:30</button>
        </div>
      </div>
      <div className="bk-chips">
        {starts.map((val) => {
          const taken =
            isStartTaken(val) ||
            maxDurationFrom(val) < minHours ||
            tooShortFor(val) ||
            (minStartFrac != null && val < minStartFrac);
          const selected = startVal === val;
          return (
            <button
              key={val}
              type="button"
              className={"bk-chip" + (selected ? " is-sel" : "") + (taken ? " is-taken" : "")}
              disabled={taken}
              onClick={() => pickStart(val)}
            >
              {fmtFrac(val)}
            </button>
          );
        })}
      </div>
      <p className="bk-times-hint">Crossed-out times are already booked (includes cleanup buffer).</p>

      {/* With the duration locked there is nothing to choose and no new price
          to quote — the reservation keeps the length (and cost) it was booked at. */}
      {fixedHours == null ? (
        <>
          <div style={{ height: 1, background: "var(--line)", margin: "20px 0" }} />

          <span style={labStyle}>How long do you need? <span style={{ textTransform: "none", letterSpacing: 0, color: "var(--ink-muted)" }}>· {minHours} hr minimum</span></span>
          {startVal == null ? (
            <p className="bk-times-hint">Pick a start time first.</p>
          ) : (
            <>
              <div className="bk-durs">{durChips}</div>
              {note ? <p className="bk-cnote">{note}</p> : null}
            </>
          )}
        </>
      ) : null}

      {fixedHours == null && startVal != null && value.hours ? (
        <div className="bk-pricebar">
          <div>
            <strong>{fmtFrac(startVal)} – {fmtFrac(startVal + value.hours)} · {value.hours} hours</strong>
            <span>${rate * value.hours} rental + ${deposit} refundable deposit</span>
          </div>
          <div className="bk-pricebar-total">
            <div className="amt">${total}</div>
            <div className="lbl">Estimated</div>
          </div>
        </div>
      ) : null}
    </>
  );
}


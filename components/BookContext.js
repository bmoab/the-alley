"use client";
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
} from "react";
import { SPACES, EVENT_TYPES, GUEST_RANGES, formatTime } from "@/lib/constants.js";
import { useBodyScrollLock } from "@/components/hooks.js";
import { submitBooking } from "@/app/(site)/book/actions.js";
import { Bolt } from "@/components/site/Primitives.js";
import PhotoSlot from "@/components/site/PhotoSlot.js";

const BookCtx = createContext(null);
export const useBook = () => useContext(BookCtx) || { openBook: () => {} };

const pad2 = (n) => String(n).padStart(2, "0");
const ymd = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`;
const parseYmd = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
function fmtDateLong(s) {
  if (!s) return "";
  return parseYmd(s).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}
/** "HH:MM" + hours → end "HH:MM". */
function addHours(hhmm, hours) {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + hours * 60;
  const eh = Math.floor(total / 60) % 24;
  const em = total % 60;
  return `${pad2(eh)}:${pad2(em)}`;
}
const toMin = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
function hoursBetween(a, b) {
  if (!a || !b) return 0;
  return Math.max(0, (toMin(b) - toMin(a)) / 60);
}
/**
 * Earliest bookable start (fractional hour-of-day) for `dateStr`, given the
 * advance-notice window. null = no restriction; 24 = whole day too soon. Greys
 * past + too-soon start chips in SmartTime; the server is authoritative.
 */
function earliestStartFracFor(dateStr, leadHours = 0) {
  if (!dateStr) return null;
  const cutoff = new Date(Date.now() + (Number(leadHours) || 0) * 3600 * 1000);
  const cutoffDate = ymd(cutoff.getFullYear(), cutoff.getMonth(), cutoff.getDate());
  if (dateStr > cutoffDate) return null;
  if (dateStr < cutoffDate) return 24;
  return cutoff.getHours() + cutoff.getMinutes() / 60;
}

export function BookProvider({ children, config }) {
  const [open, setOpen] = useState(false);
  const [roomId, setRoomId] = useState(null);
  useBodyScrollLock(open);

  const openBook = useCallback((rid = null) => {
    setRoomId(rid);
    setOpen(true);
  }, []);

  // Allow #book / #book-{room} hash to open the modal (CTAs across the site).
  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash;
      if (h === "#book") openBook(null);
      else if (h.startsWith("#book-")) openBook(h.slice(6));
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [openBook]);

  const close = () => {
    setOpen(false);
    if (window.location.hash.startsWith("#book")) {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  };

  return (
    <BookCtx.Provider value={{ openBook }}>
      {children}
      {open ? <BookModal initialRoom={roomId} config={config} onClose={close} /> : null}
    </BookCtx.Provider>
  );
}

function Stepper({ step }) {
  const labels = ["Space", "Date", "Details", "Done"];
  return (
    <div className="bk-stepper">
      {labels.map((l, i) => (
        <span key={l} className="bk-stepper-item" style={{ display: "contents" }}>
          <span className="bk-stepper-step">
            <span className={"bk-stepper-num" + (i <= step ? " is-on" : "")}>{i + 1}</span>
            <span className={"bk-stepper-label mono" + (i <= step ? " is-on" : "")}>{l}</span>
          </span>
          {i < labels.length - 1 ? <span className="bk-stepper-line" /> : null}
        </span>
      ))}
    </div>
  );
}

/** Heads-up shown when the chosen date/time is within the cancellation cutoff. */
function CutoffWarn({ cutoff, deposit }) {
  return (
    <div
      style={{
        marginTop: 16,
        padding: "12px 14px",
        border: "1px solid var(--ink)",
        background: "var(--paper-warm)",
        fontSize: 13,
        lineHeight: 1.55,
        color: "var(--ink-soft)",
      }}
    >
      <strong style={{ color: "var(--ink)" }}>Heads up:</strong> your event is within {cutoff} hours, so the
      rental fee is <strong style={{ color: "var(--ink)" }}>non-refundable</strong> if you cancel — only your
      ${deposit} cleaning deposit is refundable.
    </div>
  );
}

const fieldStyle = {
  width: "100%",
  padding: "12px 14px",
  border: "1px solid var(--line-strong)",
  background: "var(--paper-dim)",
  fontFamily: "var(--font-body)",
  fontSize: 16,
  color: "var(--ink)",
  borderRadius: 0,
  outline: "none",
};
const labStyle = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  letterSpacing: ".12em",
  textTransform: "uppercase",
  color: "var(--ink-muted)",
  marginBottom: 7,
  display: "block",
};

/** Month calendar with availability dots fed by /api/availability?month=. */
function CalendarPick({ value, onPick, space, hours, dayCounts, monthCursor, onMonthChange }) {
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
          const past = date < today;
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
 * closing time or the next booking's cleanup buffer. Mirrors the spec in
 * alley-time-selection-smart.html, driven by real bookings + owner settings.
 *
 * `value` = { start: "HH:MM"|"", hours: number|null }. `bookings` = raw
 * [{ start, end }] fractional-hour intervals (buffer applied here).
 */
function SmartTime({ config, bookings, closures, value, onChange, minStartFrac = null }) {
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

  // Start chips for the current :00 / :30 set.
  const offset = mode === 30 ? 0.5 : 0;
  const starts = [];
  for (let h = openHour; h <= closeHour - minHours; h++) {
    const val = h + offset;
    if (val > closeHour - minHours) continue;
    starts.push(val);
  }

  const pickStart = (val) => {
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

      {startVal != null && value.hours ? (
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

function BookModal({ initialRoom, config, onClose }) {
  const { rate, minHours, deposit, openHour, closeHour, minLeadHours = 0, cancellationCutoffHours = 72 } = config;
  const [step, setStep] = useState(initialRoom ? 1 : 0);
  const [room, setRoom] = useState(initialRoom || null);
  const [form, setForm] = useState({
    date: "",
    start: "",
    hours: null,
    guests: "",
    name: "",
    email: "",
    phone: "",
    type: "",
    notes: "",
    alcohol: false,
    agreed: false,
    is_public_event: false,
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const today = new Date();
  const [monthCursor, setMonthCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [dayCounts, setDayCounts] = useState({});
  const [dayBookings, setDayBookings] = useState(null); // null = not loaded
  const [dayClosures, setDayClosures] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Month availability for the calendar dots (based on the 2-hour minimum).
  useEffect(() => {
    if (!room) return;
    let active = true;
    const month = `${monthCursor.y}-${pad2(monthCursor.m + 1)}`;
    fetch(`/api/availability?space=${room}&month=${month}&hours=${minHours}`)
      .then((r) => r.json())
      .then((d) => {
        if (active && d.days) setDayCounts((prev) => ({ ...prev, ...d.days }));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [room, monthCursor, minHours]);

  // The day's existing bookings (drives greyed-out starts + max duration).
  useEffect(() => {
    if (!room || !form.date) {
      setDayBookings(null);
      return;
    }
    let active = true;
    setSlotsLoading(true);
    fetch(`/api/availability?space=${room}&date=${form.date}&bookings=1`)
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        setDayBookings(d.bookings || []);
        setDayClosures(d.closures || []);
      })
      .catch(() => {
        if (!active) return;
        setDayBookings([]);
        setDayClosures([]);
      })
      .finally(() => active && setSlotsLoading(false));
    return () => {
      active = false;
    };
  }, [room, form.date]);

  // Reset the chosen time/duration whenever the day changes.
  useEffect(() => {
    setForm((f) => ({ ...f, start: "", hours: null }));
  }, [form.date]);

  const hours = Number(form.hours) || 0;

  // Earliest bookable start for the chosen day (past + advance-notice) — greys
  // too-soon start chips in SmartTime.
  const minStartFrac = earliestStartFracFor(form.date, minLeadHours);
  // Is the chosen date+time inside the cancellation cutoff? → rental non-refundable.
  const withinCutoff = (() => {
    if (!form.date || !form.start) return false;
    const [y, mo, d] = form.date.split("-").map(Number);
    const [hh, mm] = form.start.split(":").map(Number);
    const start = new Date(y, mo - 1, d, hh || 0, mm || 0, 0, 0);
    return start.getTime() - Date.now() < cancellationCutoffHours * 3600 * 1000;
  })();

  const canNext =
    (step === 0 && room) ||
    (step === 1 && form.date && form.start && form.hours) ||
    (step === 2 && form.name && /.+@.+\..+/.test(form.email) && form.phone.trim() && form.agreed);

  const next = () => setStep((s) => Math.min(3, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));
  const roomObj = SPACES.find((r) => r.id === room);
  const rentalCost = rate * hours;
  const estTotal = rentalCost + deposit;

  async function handleSend() {
    setSubmitting(true);
    setSubmitError("");
    const res = await submitBooking({
      space: room,
      date: form.date,
      start_time: form.start,
      hours,
      client_name: form.name.trim(),
      client_email: form.email.trim(),
      client_phone: form.phone.trim(),
      event_type: form.type || null,
      guests: form.guests || null,
      notes: form.notes.trim() || null,
      alcohol: form.alcohol,
      agreed: form.agreed,
      is_public_event: form.is_public_event,
    });
    setSubmitting(false);
    if (res.ok) setStep(3);
    else setSubmitError(res.error || "Something went wrong — please try again.");
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(22,22,20,.55)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "max(4vh,20px) 12px",
        overflowY: "hidden",
        overflowX: "hidden",
        animation: "fadein .25s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bk-modal"
        style={{
          width: "min(720px,100%)",
          maxWidth: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          background: "var(--paper)",
          border: "1px solid var(--ink)",
          boxShadow: "0 30px 80px rgba(0,0,0,.3)",
          animation: "bkpop .3s cubic-bezier(.2,.7,.2,1)",
        }}
      >
        <div className="bk-modal-head">
          <div className="eyebrow">Request to book</div>
          <button onClick={onClose} aria-label="Close" className="bk-modal-x">×</button>
        </div>

        <div style={{ padding: "26px 28px 30px" }}>
          {step < 3 ? <Stepper step={step} /> : null}

          {step === 0 ? (
            <div>
              <h3 style={{ fontSize: 26, marginBottom: 4 }}>Which space?</h3>
              <p className="lede" style={{ fontSize: 15, marginTop: 0, marginBottom: 22 }}>Two rooms, endless occasions.</p>
              <div style={{ display: "grid", gap: 14 }}>
                {SPACES.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setRoom(r.id)}
                    style={{
                      textAlign: "left",
                      cursor: "pointer",
                      padding: 0,
                      overflow: "hidden",
                      border: "1px solid " + (room === r.id ? "var(--ink)" : "var(--line-strong)"),
                      background: room === r.id ? "var(--paper-warm)" : "var(--paper)",
                      display: "flex",
                      transition: "all .2s",
                    }}
                  >
                    <PhotoSlot tag={r.location} variant={r.id === "loft" ? "verde" : ""} className="bk-room-photo" />
                    <span style={{ padding: "14px 16px" }}>
                      <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 19, display: "block" }}>{r.name}</span>
                      <span className="mono" style={{ fontSize: 11, color: "var(--ink-muted)", letterSpacing: ".08em" }}>
                        {r.capacity} · ${rate} / hour
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="bk-when">
              <h3 style={{ fontSize: 26, marginBottom: 4 }}>Pick a date &amp; time</h3>
              <p className="lede" style={{ fontSize: 15, marginTop: 0, marginBottom: 20 }}>
                {roomObj ? roomObj.name : "Your space"} · ${rate}/hour · open {formatTime(pad2(openHour) + ":00")}–{formatTime(pad2(closeHour) + ":00")}
              </p>
              <div className="bk-when-grid">
                <div>
                  <span style={labStyle}>Choose a day</span>
                  <CalendarPick
                    value={form.date}
                    onPick={(d) => setForm((f) => ({ ...f, date: d }))}
                    space={room}
                    hours={minHours}
                    dayCounts={dayCounts}
                    monthCursor={monthCursor}
                    onMonthChange={setMonthCursor}
                  />
                </div>
                <div className="bk-times">
                  {!form.date ? (
                    <p className="bk-times-hint">Choose a day on the calendar first.</p>
                  ) : slotsLoading ? (
                    <p className="bk-times-hint">Checking availability…</p>
                  ) : (
                    <SmartTime
                      config={config}
                      bookings={dayBookings}
                      closures={dayClosures}
                      minStartFrac={minStartFrac}
                      value={{ start: form.start, hours: form.hours }}
                      onChange={({ start, hours }) => setForm((f) => ({ ...f, start, hours }))}
                    />
                  )}
                </div>
              </div>
              {withinCutoff ? <CutoffWarn cutoff={cancellationCutoffHours} deposit={deposit} /> : null}
            </div>
          ) : null}

          {step === 2 ? (
            <div>
              <h3 style={{ fontSize: 26, marginBottom: 18 }}>Tell us about it.</h3>
              <div style={{ display: "grid", gap: 16 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <label><span style={labStyle}>Your name</span><input name="name" autoComplete="name" value={form.name} onChange={set("name")} placeholder="Jane Maker" style={fieldStyle} /></label>
                  <label><span style={labStyle}>Email</span><input name="email" type="email" autoComplete="email" inputMode="email" value={form.email} onChange={set("email")} placeholder="you@email.com" style={fieldStyle} /></label>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <label><span style={labStyle}>Phone</span><input name="phone" type="tel" autoComplete="tel" inputMode="tel" value={form.phone} onChange={set("phone")} placeholder="(435) 555-0123" style={fieldStyle} /></label>
                  <label><span style={labStyle}>Occasion</span>
                    <select value={form.type} onChange={set("type")} style={fieldStyle}>
                      <option value="">Select…</option>
                      {EVENT_TYPES.map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </label>
                </div>
                <label><span style={labStyle}>Expected guests</span>
                  <select value={form.guests} onChange={set("guests")} style={fieldStyle}>
                    <option value="">Select…</option>
                    {GUEST_RANGES.map((g) => <option key={g}>{g}</option>)}
                  </select>
                </label>
                <label><span style={labStyle}>Anything we should know?</span>
                  <textarea value={form.notes} onChange={set("notes")} rows={3} placeholder="Tell us what you're planning…" style={{ ...fieldStyle, resize: "vertical" }} />
                </label>
                <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, color: "var(--ink-soft)", fontWeight: 300 }}>
                  <input type="checkbox" checked={form.alcohol} onChange={(e) => setForm((f) => ({ ...f, alcohol: e.target.checked }))} style={{ marginTop: 3 }} />
                  <span>Alcohol will be served at this event.</span>
                </label>
                <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, color: "var(--ink-soft)", fontWeight: 300 }}>
                  <input type="checkbox" checked={form.is_public_event} onChange={(e) => setForm((f) => ({ ...f, is_public_event: e.target.checked }))} style={{ marginTop: 3 }} />
                  <span>
                    This is a public class or event — list it on The Alley&apos;s calendar. (After payment we&apos;ll
                    email you a link to add your details.)
                  </span>
                </label>
                <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, color: "var(--ink-soft)", fontWeight: 300 }}>
                  <input type="checkbox" checked={form.agreed} onChange={(e) => setForm((f) => ({ ...f, agreed: e.target.checked }))} style={{ marginTop: 3 }} />
                  <span>
                    I've read and agree to the{" "}
                    <a href="/rental-agreement.pdf" target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>rental agreement</a>.
                  </span>
                </label>
              </div>
              <div className="bk-est">
                <div className="bk-est-row"><span>Rental (${rate} × {hours}h)</span><span>${rentalCost}</span></div>
                <div className="bk-est-row"><span>Refundable cleaning deposit</span><span>${deposit}</span></div>
                <div className="bk-est-row bk-est-total"><span>Estimated total</span><span>${estTotal}</span></div>
                <p className="bk-est-note mono">Estimate only — no charge happens now. If approved, you'll get a payment link.</p>
              </div>
              {withinCutoff ? <CutoffWarn cutoff={cancellationCutoffHours} deposit={deposit} /> : null}
              {submitError ? <p style={{ color: "var(--rust, #9c4a2e)", fontSize: 14, marginTop: 12 }}>{submitError}</p> : null}
            </div>
          ) : null}

          {step === 3 ? (
            <div style={{ textAlign: "center", padding: "10px 0 6px" }}>
              <div style={{ color: "var(--ink)", display: "flex", justifyContent: "center", marginBottom: 12 }}><Bolt width={32} height={42} /></div>
              <h3 style={{ fontSize: 28, marginBottom: 10 }}>Request received.</h3>
              <p className="lede" style={{ fontSize: 16, maxWidth: 400, margin: "0 auto 18px" }}>
                Thanks, {form.name.split(" ")[0] || "friend"} — no charge has been made. We'll review and email <b>{form.email}</b> within a day to confirm.
              </p>
              <div className="bk-recap mono">
                {roomObj ? <div><span>Space</span><b>{roomObj.name}</b></div> : null}
                {form.date ? <div><span>Date</span><b>{fmtDateLong(form.date)}</b></div> : null}
                {form.start && form.hours ? <div><span>Time</span><b>{formatTime(form.start)} – {formatTime(addHours(form.start, hours))} · {hours} hrs</b></div> : null}
                <div><span>Estimated total</span><b>${estTotal}</b></div>
              </div>
            </div>
          ) : null}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 30, gap: 12 }}>
            {step > 0 && step < 3 ? <button className="btn btn--ghost" onClick={back}>← Back</button> : <span />}
            {step < 2 ? (
              <button className="btn btn--verde" disabled={!canNext} onClick={next} style={{ opacity: canNext ? 1 : 0.4, cursor: canNext ? "pointer" : "not-allowed" }}>Continue</button>
            ) : null}
            {step === 2 ? (
              <button className="btn btn--solid" disabled={!canNext || submitting} onClick={handleSend} style={{ opacity: canNext && !submitting ? 1 : 0.4, cursor: canNext && !submitting ? "pointer" : "not-allowed" }}>
                {submitting ? "Sending…" : "Send request"}
              </button>
            ) : null}
            {step === 3 ? <button className="btn btn--solid" onClick={onClose} style={{ marginLeft: "auto" }}>Close</button> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

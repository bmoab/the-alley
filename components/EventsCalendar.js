"use client";
import { useState } from "react";
import Link from "next/link";
import { formatTime } from "@/lib/constants.js";

function parseYmd(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
const pad = (n) => String(n).padStart(2, "0");

/** Public events as toggleable List / Month views. `events` are live event rows. */
export default function EventsCalendar({ events = [] }) {
  const [view, setView] = useState("list");
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <>
      <div className="cal-toggle">
        {["list", "month"].map((v) => (
          <button key={v} className={view === v ? "is-on" : ""} onClick={() => setView(v)}>{v}</button>
        ))}
      </div>
      {view === "list" ? <CalList events={sorted} /> : <CalMonth events={sorted} />}
    </>
  );
}

function whenLabel(e) {
  // Custom end_label (e.g. "6–9 PM") wins; otherwise format the 24h time as am/pm.
  return e.end_label || (e.time ? formatTime(e.time) : "");
}

function CalList({ events }) {
  if (!events.length) {
    return (
      <div className="ev-empty">
        No public events are listed yet — check back soon, or <Link className="linkish" href="/spaces">host your own</Link>.
      </div>
    );
  }
  return (
    <div className="cal-list">
      {events.map((e) => {
        const dt = parseYmd(e.date);
        return (
          <Link key={e.key ?? e.id} href={`/events/${e.id}`} className="cal-item">
            <div className="cal-date">
              <div className="mo">{dt.toLocaleDateString("en-US", { month: "short" })}</div>
              <div className="dy">{dt.getDate()}</div>
              <div className="wd">{dt.toLocaleDateString("en-US", { weekday: "short" })}</div>
            </div>
            <div className="cal-info">
              <span className="when">
                {whenLabel(e)}
                {e.host_name ? ` · Hosted by ${e.host_name}` : ""}
              </span>
              <h3>{e.title}</h3>
              {e.description ? <p>{e.description}</p> : null}
            </div>
            {e.kind ? <span className="cal-kind">{e.kind}</span> : <span />}
          </Link>
        );
      })}
    </div>
  );
}

function CalMonth({ events }) {
  const byDate = {};
  events.forEach((e) => {
    (byDate[e.date] ||= []).push(e);
  });
  const first = events.length ? parseYmd(events[0].date) : new Date();
  const [cur, setCur] = useState({ y: first.getFullYear(), m: first.getMonth() });
  const fd = new Date(cur.y, cur.m, 1);
  const startDow = fd.getDay();
  const days = new Date(cur.y, cur.m + 1, 0).getDate();
  const today = new Date();
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  const shift = (delta) =>
    setCur((c) => {
      const m = c.m + delta;
      return { y: c.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 };
    });

  return (
    <div className="cal-month">
      <div className="cal-month-head">
        <button className="cal-month-nav" onClick={() => shift(-1)} aria-label="Previous month">‹</button>
        <h3>{fd.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h3>
        <button className="cal-month-nav" onClick={() => shift(1)} aria-label="Next month">›</button>
      </div>
      <div className="cal-dow">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <span key={d}>{d.slice(0, 1)}</span>)}</div>
      <div className="cal-cells">
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="cal-cell cal-cell--empty" />;
          const ds = `${cur.y}-${pad(cur.m + 1)}-${pad(d)}`;
          const evs = byDate[ds] || [];
          const isToday = d === today.getDate() && cur.m === today.getMonth() && cur.y === today.getFullYear();
          return (
            <div key={i} className={"cal-cell" + (isToday ? " is-today" : "")}>
              <span className="cd">{d}</span>
              {evs.map((e) => (
                <Link key={e.key ?? e.id} href={`/events/${e.id}`} className="cal-ev" title={e.title}>{e.title}</Link>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

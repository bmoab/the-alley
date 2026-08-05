"use client";
import { useState } from "react";
import Link from "next/link";
import { eventTimeLabel } from "@/lib/event-time.js";

function parseYmd(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
const pad = (n) => String(n).padStart(2, "0");

/**
 * Public events as toggleable List / Month views. `events` are live event rows,
 * past ones included.
 *
 * The two views want different things: the LIST is "what's on", so it starts at
 * today — nobody scrolls past finished workshops to find next week's. The MONTH
 * grid is a calendar, so it keeps everything and you can page back through what
 * the building has hosted.
 *
 * `today` (YYYY-MM-DD) is passed in from the server in the venue's timezone —
 * deriving it here would disagree with the server on a late-evening render.
 */
export default function EventsCalendar({ events = [], today = "" }) {
  const [view, setView] = useState("list");
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = today ? sorted.filter((e) => e.date >= today) : sorted;

  return (
    <>
      <div className="cal-toggle">
        {["list", "month"].map((v) => (
          <button key={v} className={view === v ? "is-on" : ""} onClick={() => setView(v)}>{v}</button>
        ))}
      </div>
      {view === "list" ? <CalList events={upcoming} /> : <CalMonth events={sorted} today={today} />}
    </>
  );
}

// The guest-facing time (host's "guests arrive at", falling back to the
// reservation start). See lib/event-time.js.
const whenLabel = eventTimeLabel;

function CalList({ events }) {
  if (!events.length) {
    return (
      <div className="ev-empty">
        Nothing coming up just yet — check back soon, or <Link className="linkish" href="/spaces">host your own</Link>.
      </div>
    );
  }
  return (
    <div className="cal-list">
      {events.map((e) => {
        const dt = parseYmd(e.date);
        return (
          <Link key={e.key ?? e.id} href={`/events/${e.id}?d=${e.date}`} className="cal-item">
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

function CalMonth({ events, today }) {
  const byDate = {};
  events.forEach((e) => {
    (byDate[e.date] ||= []).push(e);
  });
  // Open on the current month, not the earliest event — this grid holds history
  // now, so anchoring to the first event could land you in a past year. Paging
  // back from here is exactly how you reach it.
  const start = today ? parseYmd(today) : new Date();
  const [cur, setCur] = useState({ y: start.getFullYear(), m: start.getMonth() });
  const fd = new Date(cur.y, cur.m, 1);
  const startDow = fd.getDay();
  const days = new Date(cur.y, cur.m + 1, 0).getDate();
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
          // Compared as venue dates, so the highlight doesn't jump a day for a
          // visitor in another timezone.
          const isToday = ds === today;
          return (
            <div key={i} className={"cal-cell" + (isToday ? " is-today" : "")}>
              <span className="cd">{d}</span>
              {evs.map((e) => (
                <Link key={e.key ?? e.id} href={`/events/${e.id}?d=${e.date}`} className="cal-ev" title={e.title}>{e.title}</Link>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

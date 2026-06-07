"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import Placeholder from "./Placeholder.js";

function fmtDate(ymd) {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
function fmtTime(hhmm) {
  if (!hhmm) return "";
  let [h, m] = hhmm.split(":");
  h = parseInt(h, 10);
  const p = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${m} ${p}`;
}

function ListView({ events }) {
  if (events.length === 0) {
    return (
      <div className="card p-10 text-center text-ink-muted">
        No public events are listed yet. Check back soon.
      </div>
    );
  }
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {events.map((e, i) => (
        <Link
          key={e.id}
          href={`/events/${e.id}`}
          className="card overflow-hidden transition hover:border-brass/50"
        >
          <Placeholder src={e.photo_path} label={e.title} seed={i} className="h-40 w-full" rounded="rounded-none" />
          <div className="p-5">
            <div className="text-xs font-semibold uppercase tracking-wider text-brass-dark">
              {fmtDate(e.date)} {e.time ? `· ${fmtTime(e.time)}` : ""}
            </div>
            <h3 className="mt-1 font-display text-lg font-semibold text-ink">{e.title}</h3>
            {e.host_name ? (
              <p className="mt-1 text-sm text-ink-muted">Hosted by {e.host_name}</p>
            ) : null}
            {e.tickets ? (
              <p className="mt-2 text-xs text-ink-muted">{e.tickets} spots</p>
            ) : null}
          </div>
        </Link>
      ))}
    </div>
  );
}

function CalendarView({ events }) {
  const today = new Date();
  const [cursor, setCursor] = useState({
    year: today.getFullYear(),
    month: today.getMonth(), // 0-indexed
  });

  const byDate = useMemo(() => {
    const map = {};
    for (const e of events) {
      if (!e.date) continue;
      (map[e.date] ||= []).push(e);
    }
    return map;
  }, [events]);

  const first = new Date(cursor.year, cursor.month, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const monthLabel = first.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  function shift(delta) {
    setCursor((c) => {
      const m = c.month + delta;
      return { year: c.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
    });
  }

  const pad = (n) => String(n).padStart(2, "0");

  return (
    <div className="card p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <button onClick={() => shift(-1)} className="btn-ghost !px-4 !py-2 text-sm" aria-label="Previous month">←</button>
        <h3 className="font-display text-xl font-semibold text-ink">{monthLabel}</h3>
        <button onClick={() => shift(1)} className="btn-ghost !px-4 !py-2 text-sm" aria-label="Next month">→</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase tracking-wider text-ink-muted">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="py-2">{d.slice(0, 1)}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="min-h-[68px] rounded-lg" />;
          const ymd = `${cursor.year}-${pad(cursor.month + 1)}-${pad(d)}`;
          const dayEvents = byDate[ymd] || [];
          const isToday =
            d === today.getDate() &&
            cursor.month === today.getMonth() &&
            cursor.year === today.getFullYear();
          return (
            <div
              key={i}
              className={`min-h-[68px] rounded-lg border p-1.5 text-left ${
                isToday ? "border-brass bg-brass/5" : "border-ink/10"
              }`}
            >
              <div className="text-xs font-semibold text-ink-muted">{d}</div>
              <div className="mt-0.5 space-y-0.5">
                {dayEvents.slice(0, 2).map((e) => (
                  <Link
                    key={e.id}
                    href={`/events/${e.id}`}
                    className="block truncate rounded bg-ink px-1.5 py-0.5 text-[10px] font-medium text-paper hover:bg-ink-soft"
                    title={e.title}
                  >
                    {e.title}
                  </Link>
                ))}
                {dayEvents.length > 2 ? (
                  <div className="px-1 text-[10px] text-ink-muted">+{dayEvents.length - 2} more</div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function EventsView({ events }) {
  const [view, setView] = useState("list");
  return (
    <div>
      <div className="mb-6 inline-flex rounded-full border border-ink/15 bg-paper-card p-1">
        {["list", "calendar"].map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize transition ${
              view === v ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"
            }`}
          >
            {v}
          </button>
        ))}
      </div>
      {view === "list" ? <ListView events={events} /> : <CalendarView events={events} />}
    </div>
  );
}

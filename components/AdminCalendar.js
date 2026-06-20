"use client";
import { useMemo, useState } from "react";

// Color treatment per item kind, color-coded by space (plus public events).
const KIND_STYLES = {
  loft: "bg-brass text-ink",
  main: "bg-ink text-paper",
  event: "bg-rust text-paper",
};

const KIND_LABELS = {
  loft: "Loft booking",
  main: "Main Floor booking",
  event: "Public event",
};

function fmtTime(hhmm) {
  if (!hhmm) return "";
  let [h, m] = hhmm.split(":");
  h = parseInt(h, 10);
  const p = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${m} ${p}`;
}

/**
 * Month view of all held/confirmed bookings plus live public events.
 * `items` is a flat list of { id, date: "YYYY-MM-DD", title, kind, time, meta }.
 */
export default function AdminCalendar({ items = [] }) {
  const today = new Date();
  const [cursor, setCursor] = useState({
    year: today.getFullYear(),
    month: today.getMonth(),
  });

  const byDate = useMemo(() => {
    const map = {};
    for (const it of items) {
      if (!it.date) continue;
      (map[it.date] ||= []).push(it);
    }
    for (const list of Object.values(map)) {
      list.sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    }
    return map;
  }, [items]);

  const first = new Date(cursor.year, cursor.month, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const monthLabel = first.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  function shift(delta) {
    setCursor((c) => {
      const m = c.month + delta;
      return { year: c.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
    });
  }
  function goToday() {
    setCursor({ year: today.getFullYear(), month: today.getMonth() });
  }

  const pad = (n) => String(n).padStart(2, "0");

  return (
    <div className="card p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <button
          onClick={() => shift(-1)}
          className="btn-ghost !px-4 !py-2 text-sm"
          aria-label="Previous month"
        >
          ←
        </button>
        <div className="flex items-center gap-3">
          <h3 className="font-display text-xl font-semibold text-ink">
            {monthLabel}
          </h3>
          <button onClick={goToday} className="btn-ghost !px-3 !py-1 text-xs">
            Today
          </button>
        </div>
        <button
          onClick={() => shift(1)}
          className="btn-ghost !px-4 !py-2 text-sm"
          aria-label="Next month"
        >
          →
        </button>
      </div>

      {/* Legend */}
      <div className="mb-4 flex flex-wrap gap-3 text-xs text-ink-muted">
        {Object.entries(KIND_LABELS).map(([kind, label]) => (
          <span key={kind} className="inline-flex items-center gap-1.5">
            <span className={`inline-block h-2.5 w-2.5 rounded-sm ${KIND_STYLES[kind]}`} />
            {label}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase tracking-wider text-ink-muted">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="py-2">
            {d.slice(0, 1)}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="min-h-[84px] rounded-lg" />;
          const ymd = `${cursor.year}-${pad(cursor.month + 1)}-${pad(d)}`;
          const dayItems = byDate[ymd] || [];
          const isToday =
            d === today.getDate() &&
            cursor.month === today.getMonth() &&
            cursor.year === today.getFullYear();
          return (
            <div
              key={i}
              className={`min-h-[84px] rounded-lg border p-1.5 text-left ${
                isToday ? "border-brass bg-brass/5" : "border-ink/10"
              }`}
            >
              <div className="text-xs font-semibold text-ink-muted">{d}</div>
              <div className="mt-0.5 space-y-0.5">
                {dayItems.slice(0, 3).map((it) => (
                  <a
                    key={`${it.kind}-${it.id}`}
                    href={it.href || undefined}
                    className={`block truncate rounded px-1.5 py-0.5 text-[10px] font-medium transition hover:opacity-80 ${
                      KIND_STYLES[it.kind] || "bg-ink text-paper"
                    }`}
                    title={`${KIND_LABELS[it.kind] || ""}: ${it.title}${
                      it.time ? ` · ${fmtTime(it.time)}` : ""
                    }${it.meta ? ` · ${it.meta}` : ""}`}
                  >
                    {it.time ? `${fmtTime(it.time)} ` : ""}
                    {it.title}
                  </a>
                ))}
                {dayItems.length > 3 ? (
                  <div className="px-1 text-[10px] text-ink-muted">
                    +{dayItems.length - 3} more
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

"use client";
import { useMemo, useState } from "react";
import { SPACES } from "@/lib/constants.js";

/**
 * Two things matter about a night at a glance: WHICH ROOM, and WHETHER GUESTS
 * CAN SEE IT. So hue carries the room and fill carries the visibility — filled
 * means it's on the public calendar, outlined means it isn't. Two treatments
 * across three rooms is a system you learn once; six unrelated colours is a
 * legend you re-read every time.
 *
 * Paired [filled, outlined] in SPACES order. The Loft takes sage rather than the
 * pale verde chiaro it used to have: it's by far the busiest room, and an
 * OUTLINE in a near-white tint would be invisible on a white cell. The
 * Conference Room, the quietest and rarely public, takes the pale one.
 */
const SPACE_SWATCHES = [
  ["bg-ink text-paper", "border border-dashed border-ink/60 bg-ink/5 text-ink"],
  [
    "bg-verde-deep text-paper",
    "border border-dashed border-verde-deep bg-verde-deep/10 text-verde-deep",
  ],
  ["bg-verde-mid text-ink", "border border-dashed border-verde-mid bg-verde-mid/25 text-ink-soft"],
];

// A room's "not public" kind is its id + this suffix; the page builds the same.
const PRIVATE_SUFFIX = "-private";

const KIND_STYLES = {
  ...Object.fromEntries(
    SPACES.flatMap((s, i) => {
      const [filled, outlined] = SPACE_SWATCHES[i % SPACE_SWATCHES.length];
      return [
        [s.id, filled],
        [`${s.id}${PRIVATE_SUFFIX}`, outlined],
      ];
    })
  ),
  // The Alley's own events book no room, so they can't be coloured by one.
  event: "bg-rust text-paper",
  eventHidden: "border border-dashed border-rust bg-rust/10 text-rust",
  cancelled: "bg-ink/15 text-ink-muted line-through",
};

// Tooltip prefixes. Both states of a room read the same here — the chip's `meta`
// already spells out whether guests can see it.
const KIND_LABELS = {
  ...Object.fromEntries(
    SPACES.flatMap((s) => {
      const room = s.name.replace("The Alley ", "");
      return [
        [s.id, room],
        [`${s.id}${PRIVATE_SUFFIX}`, room],
      ];
    })
  ),
  event: "The Alley's own event",
  eventHidden: "The Alley's own event",
  cancelled: "Cancelled",
};

// One swatch per room + the Alley's own, then a line explaining fill vs outline.
// Listing every room x state combination would be eight swatches nobody reads.
const LEGEND = [
  ...SPACES.map((s) => ({ kind: s.id, label: s.name.replace("The Alley ", "") })),
  { kind: "event", label: "The Alley's own" },
];

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
 * Month view of all held/confirmed bookings plus every event listing, one chip
 * per night: coloured by room, filled when guests can see it and outlined when
 * they can't (the `meta` says why).
 * `items` is a flat list of { id, date: "YYYY-MM-DD", title, kind, time, meta }.
 */
export default function AdminCalendar({ items = [], closedDates = {} }) {
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
      <div className="mb-1.5 flex flex-wrap gap-3 text-xs text-ink-muted">
        {LEGEND.map(({ kind, label }) => (
          <span key={kind} className="inline-flex items-center gap-1.5">
            <span className={`inline-block h-2.5 w-2.5 rounded-sm ${KIND_STYLES[kind]}`} />
            {label}
          </span>
        ))}
      </div>
      <p className="mb-4 text-xs text-ink-muted">
        Filled = on the public calendar · Outlined = not public ·{" "}
        <span className="line-through">Grey</span> = cancelled
      </p>

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
          const closedLabels = closedDates[ymd];
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
              {closedLabels ? (
                <div
                  className="mt-0.5 truncate rounded bg-rust/15 px-1.5 py-0.5 text-[10px] font-semibold text-rust"
                  title={`Closed: ${closedLabels.join(", ")}`}
                >
                  ✕ Closed
                </div>
              ) : null}
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

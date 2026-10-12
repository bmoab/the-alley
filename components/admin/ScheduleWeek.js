"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/admin/ui/toast-store.js";
import { fmtRange, fmtHours } from "@/lib/shift-format.js";

/**
 * One week of the staff schedule: a column per day holding what's happening in
 * the building (bookings and events, drawn quietly as context) and the shifts
 * scheduled around it. Managers get add / edit / delete; staff get the same
 * picture read-only (`editable` false, published shifts only).
 *
 * Times are venue-local "HH:MM" strings throughout; nothing here does timezone math.
 */

const ROLE_SUGGESTIONS = ["Register", "Opening", "Closing", "Event", "Stocking"];

function hoursBetween(start, end) {
  const [a, b] = [start, end].map((t) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  });
  let mins = b - a;
  if (mins <= 0) mins += 24 * 60;
  return mins / 60;
}

function dayLabel(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return {
    dow: dt.toLocaleDateString("en-US", { weekday: "short" }),
    date: dt.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  };
}

/** "HH:MM" moved by whole minutes, clamped to the day. */
function nudge(hhmm, minutes) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const t = Math.min(Math.max(h * 60 + m + minutes, 0), 23 * 60 + 59);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

function ShiftEditor({ draft, employees, happenings, saveShift, removeShift, onClose }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  const sameDay = happenings.filter((h) => h.date === draft.date);

  function run(action, formData) {
    setError(null);
    startTransition(async () => {
      const res = await action(formData);
      if (res?.error) {
        setError(res.error);
        return;
      }
      toast(res?.message || "Saved.", { tone: "success" });
      onClose();
      router.refresh();
    });
  }

  const { dow, date } = dayLabel(draft.date);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-paper p-5 shadow-card sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-ink">
            {draft.id ? "Edit shift" : "New shift"} · {dow} {date}
          </h3>
          <button type="button" onClick={onClose} className="text-sm text-ink-muted hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>

        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(saveShift, new FormData(e.currentTarget));
          }}
        >
          {draft.id ? <input type="hidden" name="id" value={draft.id} /> : null}
          <input type="hidden" name="date" value={draft.date} />
          <div>
            <label className="label">Who</label>
            <select name="employee_id" defaultValue={draft.employee_id ?? ""} className="field">
              <option value="">Open shift — nobody yet</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Starts</label>
              <input name="start_time" type="time" required defaultValue={draft.start_time || ""} className="field" />
            </div>
            <div>
              <label className="label">Ends</label>
              <input name="end_time" type="time" required defaultValue={draft.end_time || ""} className="field" />
            </div>
          </div>
          <div>
            <label className="label">Job (optional)</label>
            <input name="role" list="shift-roles" defaultValue={draft.role || ""} className="field" placeholder="Register, Event…" />
            <datalist id="shift-roles">
              {ROLE_SUGGESTIONS.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </div>
          {sameDay.length ? (
            <div>
              <label className="label">Covering an event? (optional)</label>
              <select name="link" defaultValue={draft.link || ""} className="field">
                <option value="">No — a regular shift</option>
                {sameDay.map((h) => (
                  <option key={h.key} value={`${h.bookingId || ""}|${h.eventId || ""}`}>
                    {fmtRange(h.start, h.end)} {h.title}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div>
            <label className="label">Note for them (optional)</label>
            <input name="note" defaultValue={draft.note || ""} className="field" placeholder="e.g. count the drawer at close" />
          </div>

          {error ? (
            <p className="rounded-lg border border-rust/30 bg-rust/10 px-3 py-2 text-sm text-rust">{error}</p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button type="submit" disabled={pending} className="h-10 rounded-xl bg-ink px-4 text-sm font-semibold text-paper disabled:opacity-50">
              {pending ? "Saving…" : draft.id ? "Save shift" : "Add shift"}
            </button>
            <button type="button" onClick={onClose} className="h-10 rounded-xl border border-line-strong px-4 text-sm font-semibold text-ink">
              Cancel
            </button>
            {draft.id ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  const fd = new FormData();
                  fd.set("id", draft.id);
                  run(removeShift, fd);
                }}
                className="ml-auto h-10 rounded-xl border border-rust/30 px-4 text-sm font-semibold text-rust hover:bg-rust/10 disabled:opacity-50"
              >
                Delete
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ScheduleWeek({
  dates,
  today,
  shifts,
  happenings,
  closed = {},
  employees = [],
  editable = false,
  highlightEmployeeId = null,
  saveShift,
  removeShift,
}) {
  const [draft, setDraft] = useState(null);

  return (
    <>
      <div className="grid gap-3 lg:grid-cols-7 lg:gap-2">
        {dates.map((d) => {
          const { dow, date } = dayLabel(d);
          const dayShifts = shifts.filter((s) => s.date === d);
          const dayHappenings = happenings.filter((h) => h.date === d);
          const isToday = d === today;
          return (
            <section
              key={d}
              className={`rounded-xl border bg-paper p-3 lg:min-h-[260px] lg:p-2 ${
                isToday ? "border-verde-deep ring-1 ring-verde-deep/40" : "border-line"
              } ${d < today ? "opacity-70" : ""}`}
            >
              <header className="mb-2 flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-ink">
                  {dow} <span className="font-normal text-ink-muted">{date}</span>
                </p>
                {isToday ? <span className="text-[10px] font-semibold uppercase tracking-wider text-verde-deep">Today</span> : null}
              </header>

              {(closed[d] || []).map((c, i) => (
                <p key={i} className="mb-1 rounded bg-rust/10 px-1.5 py-0.5 text-[11px] font-semibold text-rust">
                  ✕ {c}
                </p>
              ))}

              {dayHappenings.length ? (
                <ul className="mb-2 space-y-1">
                  {dayHappenings.map((h) => (
                    <li key={h.key} className="rounded-md bg-paper-dim px-1.5 py-1 text-[11px] leading-tight text-ink-soft">
                      <span className="font-semibold text-ink">{fmtRange(h.start, h.end)}</span> {h.title}
                      <span className="block text-ink-muted">
                        {h.room}
                        {h.isPublic ? " · public" : ""}
                      </span>
                      {editable && h.start ? (
                        <button
                          type="button"
                          onClick={() =>
                            setDraft({
                              date: d,
                              start_time: nudge(h.start, -30),
                              end_time: h.end ? nudge(h.end, 30) : nudge(h.start, 4 * 60),
                              role: "Event",
                              link: `${h.bookingId || ""}|${h.eventId || ""}`,
                            })
                          }
                          className="mt-0.5 text-[11px] font-semibold text-verde-deep hover:underline"
                        >
                          + staff this
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}

              <ul className="space-y-1.5">
                {dayShifts.map((s) => {
                  const mine = highlightEmployeeId && s.employee_id === highlightEmployeeId;
                  const body = (
                    <>
                      <span className="flex items-center justify-between gap-1">
                        <span className="truncate font-semibold text-ink">{s.employee_name || "Open shift"}</span>
                        {s.status === "draft" ? (
                          <span className="shrink-0 rounded bg-amber-100 px-1 text-[10px] font-semibold uppercase text-amber-800">Draft</span>
                        ) : null}
                      </span>
                      <span className="block text-ink-soft">
                        {fmtRange(s.start_time, s.end_time)} · {fmtHours(hoursBetween(s.start_time, s.end_time))}
                      </span>
                      {s.role ? <span className="block text-ink-muted">{s.role}</span> : null}
                      {s.note ? <span className="block italic text-ink-muted">{s.note}</span> : null}
                    </>
                  );
                  const cls = `block w-full rounded-lg border-l-4 px-2 py-1.5 text-left text-xs leading-snug ${
                    s.employee_id ? "bg-paper-warm" : "border-dashed bg-amber-50"
                  } ${mine ? "ring-2 ring-ink/70" : ""}`;
                  const style = { borderLeftColor: s.employee_color || "#c08a1e" };
                  return (
                    <li key={s.id}>
                      {editable ? (
                        <button
                          type="button"
                          className={`${cls} hover:bg-verde/30`}
                          style={style}
                          onClick={() =>
                            setDraft({
                              ...s,
                              link: s.booking_id || s.event_id ? `${s.booking_id || ""}|${s.event_id || ""}` : "",
                            })
                          }
                        >
                          {body}
                        </button>
                      ) : (
                        <div className={cls} style={style}>
                          {body}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>

              {!dayShifts.length && !editable ? <p className="text-xs text-ink-muted">Nobody scheduled.</p> : null}

              {editable ? (
                <button
                  type="button"
                  onClick={() => setDraft({ date: d, start_time: "10:00", end_time: "18:00" })}
                  className="mt-2 w-full rounded-lg border border-dashed border-line-strong py-1.5 text-xs font-semibold text-ink-muted hover:border-ink/50 hover:text-ink"
                >
                  + Add shift
                </button>
              ) : null}
            </section>
          );
        })}
      </div>

      {draft ? (
        <ShiftEditor
          draft={draft}
          employees={employees}
          happenings={happenings}
          saveShift={saveShift}
          removeShift={removeShift}
          onClose={() => setDraft(null)}
        />
      ) : null}
    </>
  );
}

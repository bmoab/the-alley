"use client";
import { useState } from "react";
import {
  spaceName,
  formatDate,
  formatTime,
  formatMoney,
} from "@/lib/constants.js";

/**
 * One pending booking request in the admin Requests view.
 * The owner can adjust rate / hours / sessions / deposit (total recalculates
 * live) before approving, or deny. Both buttons submit the same form to
 * different server actions via formAction.
 */
export default function RequestCard({ booking, approveAction, denyAction }) {
  const [rate, setRate] = useState(booking.rate ?? 75);
  const [hours, setHours] = useState(booking.hours ?? 2);
  const [sessions, setSessions] = useState(booking.sessions ?? 1);
  const [deposit, setDeposit] = useState(booking.deposit ?? 150);
  const [busy, setBusy] = useState(false);

  const rental = (Number(rate) || 0) * (Number(hours) || 0) * Math.max(1, Number(sessions) || 1);
  const total = rental + (Number(deposit) || 0);

  const detail = (label, value) =>
    value ? (
      <div className="flex justify-between gap-4 py-1.5">
        <dt className="text-ink-muted">{label}</dt>
        <dd className="text-right font-medium text-ink">{value}</dd>
      </div>
    ) : null;

  return (
    <div className="card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-brass-dark">
            {spaceName(booking.space)}
            {booking.is_public_event ? (
              <span className="ml-2 rounded-full bg-brass/15 px-2 py-0.5 text-[10px] text-brass-dark">
                Wants calendar listing
              </span>
            ) : null}
          </div>
          <h3 className="mt-1 font-display text-xl font-semibold text-ink">
            {booking.client_name}
          </h3>
          <p className="text-sm text-ink-muted">
            {formatDate(booking.date)} · {formatTime(booking.start_time)} ·{" "}
            {booking.hours}h
          </p>
        </div>
        <div className="text-right text-sm">
          <a href={`mailto:${booking.client_email}`} className="block text-brass-dark hover:underline">
            {booking.client_email}
          </a>
          <a href={`tel:${booking.client_phone}`} className="block text-ink-muted">
            {booking.client_phone}
          </a>
        </div>
      </div>

      {/* Intake details */}
      <dl className="mt-4 grid gap-x-8 text-sm sm:grid-cols-2">
        {detail("Event type", booking.event_type)}
        {detail("Expected guests", booking.guests)}
        {detail("Alcohol served", booking.alcohol ? "Yes" : "No")}
        {detail(
          "Recurring",
          booking.is_recurring ? booking.recurring_schedule || "Yes" : null
        )}
      </dl>
      {booking.notes ? (
        <div className="mt-3 rounded-lg bg-paper-warm p-3 text-sm text-ink-soft">
          <span className="font-semibold text-ink">Notes: </span>
          {booking.notes}
        </div>
      ) : null}

      {/* Pricing editor + actions */}
      <form className="mt-5 border-t border-ink/10 pt-5">
        <input type="hidden" name="id" value={booking.id} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className="label">Rate / hr</label>
            <input name="rate" type="number" min="0" step="1" value={rate} onChange={(e) => setRate(e.target.value)} className="field" />
          </div>
          <div>
            <label className="label">Hours</label>
            <input name="hours" type="number" min="0" step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} className="field" />
          </div>
          <div>
            <label className="label">Sessions</label>
            <input name="sessions" type="number" min="1" step="1" value={sessions} onChange={(e) => setSessions(e.target.value)} className="field" />
          </div>
          <div>
            <label className="label">Deposit</label>
            <input name="deposit" type="number" min="0" step="1" value={deposit} onChange={(e) => setDeposit(e.target.value)} className="field" />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-ink-soft">
            Rental {formatMoney(rental)}
            {Number(sessions) > 1 ? ` (${sessions} sessions)` : ""} + deposit{" "}
            {formatMoney(Number(deposit) || 0)} ={" "}
            <span className="font-display text-lg font-semibold text-ink">
              {formatMoney(total)}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              formAction={denyAction}
              onClick={() => setBusy(true)}
              disabled={busy}
              className="btn-ghost !px-4 !py-2 text-sm text-rust hover:border-rust/50 disabled:opacity-50"
            >
              Deny
            </button>
            <button
              formAction={approveAction}
              onClick={() => setBusy(true)}
              disabled={busy}
              className="btn-accent !px-5 !py-2 text-sm disabled:opacity-50"
            >
              Approve &amp; send payment link
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

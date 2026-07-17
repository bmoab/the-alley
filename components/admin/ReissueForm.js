"use client";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import Button from "@/components/admin/ui/Button.js";
import { formatMoney } from "@/lib/constants.js";

/**
 * Pricing editor for repricing an approved booking, with a live total. Deposit
 * is a separate line so the common fix — "charge the deposit once, not on every
 * session" — is just setting deposit to 0 on the extra bookings. Submitting
 * voids the old invoice and issues a corrected one (server side).
 */
function SubmitButton({ total, wasTotal }) {
  const { pending } = useFormStatus();
  const changed = Number(total) !== Number(wasTotal);
  const free = Number(total) === 0;
  return (
    <Button type="submit" variant="accent" disabled={pending || !changed}>
      {pending
        ? "Reissuing…"
        : free
          ? "Save — make it free"
          : `Save & reissue at ${formatMoney(total)}`}
    </Button>
  );
}

export default function ReissueForm({ booking, action }) {
  const [rate, setRate] = useState(booking.rate ?? 0);
  const [hours, setHours] = useState(booking.hours ?? 0);
  const [deposit, setDeposit] = useState(booking.deposit ?? 0);

  const sessions = Math.max(1, Number(booking.sessions) || 1);
  const rental = (Number(rate) || 0) * (Number(hours) || 0) * sessions;
  const total = rental + (Number(deposit) || 0);
  const changed = Number(total) !== Number(booking.total);

  return (
    <form action={action} className="mt-5">
      <input type="hidden" name="id" value={booking.id} />

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="label">Rate / hr</label>
          <input
            name="rate"
            type="number"
            min="0"
            step="1"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            className="field"
          />
        </div>
        <div>
          <label className="label">Hours</label>
          <input
            name="hours"
            type="number"
            min="0"
            step="0.5"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className="field"
          />
        </div>
        <div>
          <label className="label">Deposit</label>
          <input
            name="deposit"
            type="number"
            min="0"
            step="1"
            value={deposit}
            onChange={(e) => setDeposit(e.target.value)}
            className="field"
          />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-lg bg-paper-warm px-4 py-3 text-sm">
        <span className="text-ink-soft">
          Rental {formatMoney(rental)}
          {sessions > 1 ? ` (${sessions} sessions)` : ""} + deposit {formatMoney(Number(deposit) || 0)}
        </span>
        <span className="text-lg font-semibold text-ink">{formatMoney(total)}</span>
      </div>

      <p className="mt-2 text-xs text-ink-muted">
        Was {formatMoney(booking.total)}.{" "}
        {total === 0
          ? "A $0 total confirms the booking as free — no invoice is sent."
          : "The client’s old payment link is voided and a new one is emailed."}
      </p>

      <div className="mt-5 flex items-center justify-end gap-2">
        <Button href="/admin/bookings" variant="ghost" size="sm">Cancel</Button>
        <SubmitButton total={total} wasTotal={booking.total} />
      </div>
      {!changed ? (
        <p className="mt-2 text-right text-xs text-ink-muted">Change a value to reissue.</p>
      ) : null}
    </form>
  );
}

"use client";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import {
  spaceName,
  formatDate,
  formatTime,
  formatMoney,
} from "@/lib/constants.js";
import Button from "@/components/admin/ui/Button.js";
import DenyDialog from "@/components/admin/DenyDialog.js";

/**
 * A submit button bound to a specific server action via formAction. Uses
 * useFormStatus for the pending state instead of a manual onClick+disabled,
 * which would otherwise cancel the form submission for server actions.
 */
function SubmitButton({ formAction, variant, children, pendingLabel }) {
  const { pending } = useFormStatus();
  return (
    <Button formAction={formAction} disabled={pending} variant={variant} size="sm">
      {pending ? pendingLabel || "Working…" : children}
    </Button>
  );
}

/**
 * Tenant attribution for a request: a checkbox that reveals the tenant list,
 * plus a live tally of that tenant's free bookings for the event's year. The
 * tag records WHO; the price decides whether it's free, so the two can't
 * disagree. Over-allowance warns but never blocks — the owner decides.
 */
function TenantPicker({
  tenants,
  isTenant,
  setIsTenant,
  tenantId,
  setTenantId,
  used,
  allowance,
  allowanceGone,
  isFree,
  eventYear,
  suggested,
}) {
  return (
    <div className="mt-4 rounded-lg border border-line bg-paper-warm p-3">
      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink">
        <input
          type="checkbox"
          checked={isTenant}
          onChange={(e) => {
            setIsTenant(e.target.checked);
            if (!e.target.checked) setTenantId("");
          }}
          className="h-4 w-4 accent-verde-deep"
        />
        This is a tenant booking
      </label>

      {/* Always submitted: empty string clears the tag. */}
      <input type="hidden" name="tenant_id" value={isTenant ? tenantId : ""} />

      {isTenant ? (
        <div className="mt-3">
          <label className="label" htmlFor={`tenant-${eventYear}-${allowance}`}>
            Tenant
          </label>
          <select
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            className="field"
          >
            <option value="">Select a tenant…</option>
            {tenants.map((t) => (
              <option key={t.id} value={String(t.id)}>
                {t.business_name}
              </option>
            ))}
          </select>

          {tenants.length === 0 ? (
            <p className="mt-2 text-xs text-ink-muted">
              No tenants in the Directory yet — add one there first.
            </p>
          ) : null}

          {suggested ? (
            <p className="mt-2 text-xs text-ink-muted">
              Matched automatically from the client&rsquo;s email — change it if that&rsquo;s wrong.
            </p>
          ) : null}

          {tenantId ? (
            <p
              className={
                "mt-2 text-xs font-medium " +
                (allowanceGone && isFree ? "text-rust" : "text-ink-soft")
              }
            >
              {allowanceGone
                ? `All ${allowance} free bookings used in ${eventYear}.` +
                  (isFree ? " Approving this at $0 goes over the allowance." : "")
                : `${used} of ${allowance} free bookings used in ${eventYear}.` +
                  (isFree ? ` This one makes ${used + 1}.` : "")}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * One pending booking request in the admin Requests view.
 * The owner can adjust rate / hours / sessions / deposit (total recalculates
 * live) before approving, or deny. Both buttons submit the same form to
 * different server actions via formAction.
 */
export default function RequestCard({
  booking,
  series,
  approveAction,
  denyAction,
  approveSeriesAction,
  tenants = [],
  tenantUsage = {},
  tenantAllowance = 2,
  suggestedTenantId = null,
}) {
  const [rate, setRate] = useState(booking.rate ?? 75);
  const [hours, setHours] = useState(booking.hours ?? 2);
  const [sessions, setSessions] = useState(booking.sessions ?? 1);
  // Series deposit lives on the holder row; fall back to the standard default.
  const [deposit, setDeposit] = useState(
    (series ? series.find((r) => r.is_deposit_holder)?.deposit : booking.deposit) ?? 150
  );
  const [invoiceMode, setInvoiceMode] = useState("scheduled");
  // Pre-tick when the client's email matches a tenant's listed contact — the
  // common case is confirming a guess, not hunting through the dropdown.
  const [isTenant, setIsTenant] = useState(Boolean(booking.tenant_id || suggestedTenantId));
  const [tenantId, setTenantId] = useState(
    String(booking.tenant_id || suggestedTenantId || "")
  );

  const rental = (Number(rate) || 0) * (Number(hours) || 0) * Math.max(1, Number(sessions) || 1);
  const total = rental + (Number(deposit) || 0);

  // Free-booking tally for the picked tenant, in the year this event falls in.
  // `free` differs per card (a series totals across its sessions), so the picker
  // is rendered per-branch rather than precomputed.
  const eventYear = String(booking.date || "").slice(0, 4);
  const used = tenantId ? tenantUsage[tenantId] || 0 : 0;
  const isFree = total === 0;
  const renderTenantPicker = (free) => (
    <TenantPicker
      tenants={tenants}
      isTenant={isTenant}
      setIsTenant={setIsTenant}
      tenantId={tenantId}
      setTenantId={setTenantId}
      used={used}
      allowance={tenantAllowance}
      allowanceGone={used >= tenantAllowance}
      isFree={free}
      eventYear={eventYear}
      suggested={Boolean(suggestedTenantId) && String(suggestedTenantId) === tenantId}
    />
  );

  // ---- Recurring series card ----
  if (series && series.length) {
    const holder = series.find((r) => r.is_deposit_holder) || series[0];
    const seriesRental = (Number(rate) || 0) * (Number(hours) || 0) * series.length;
    const seriesTotal = seriesRental + (Number(deposit) || 0);
    return (
      <div className="card animate-fade-in-up p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-verde-deep">
              {spaceName(holder.space)}
              <span className="rounded-full border border-sky-300 bg-sky-100 px-2 py-0.5 text-[10px] normal-case tracking-normal text-sky-800">
                Recurring · {series.length} sessions
              </span>
              {holder.is_public_event ? (
                <span className="rounded-full border border-verde-deep/30 bg-verde-deep/15 px-2 py-0.5 text-[10px] normal-case tracking-normal text-verde-deep">
                  Wants calendar listing
                </span>
              ) : null}
            </div>
            <h3 className="mt-1 text-xl font-semibold text-ink">{holder.client_name}</h3>
            <p className="text-sm text-ink-muted">
              {holder.recurring_schedule || `${series.length} sessions`} · {formatTime(holder.start_time)} · {holder.hours}h each
            </p>
            <Link
              href={`/admin/requests?b=${holder.id}`}
              scroll={false}
              className="mt-1 inline-block text-xs font-medium text-verde-deep hover:underline"
            >
              View activity →
            </Link>
          </div>
          <div className="text-right text-sm">
            <a href={`mailto:${holder.client_email}`} className="block font-medium text-verde-deep hover:underline">
              {holder.client_email}
            </a>
            <a href={`tel:${holder.client_phone}`} className="block text-ink-muted">
              {holder.client_phone}
            </a>
          </div>
        </div>

        <ul className="mt-4 grid gap-1 text-sm text-ink-soft sm:grid-cols-2">
          {series.map((r) => (
            <li key={r.id} className="flex justify-between gap-3">
              <span>Session {r.series_index}: {formatDate(r.date)}</span>
              <span className="text-ink-muted">{formatTime(r.start_time)}</span>
            </li>
          ))}
        </ul>
        {holder.notes ? (
          <div className="mt-3 rounded-lg bg-paper-warm p-3 text-sm text-ink-soft">
            <span className="font-semibold text-ink">Notes: </span>
            {holder.notes}
          </div>
        ) : null}

        <form className="mt-5 border-t border-line pt-5">
          <input type="hidden" name="series_id" value={holder.series_id} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="label">Rate / hr</label>
              <input name="rate" type="number" min="0" step="1" value={rate} onChange={(e) => setRate(e.target.value)} className="field" />
            </div>
            <div>
              <label className="label">Hours / session</label>
              <input name="hours" type="number" min="0" step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} className="field" />
            </div>
            <div>
              <label className="label">Deposit (series)</label>
              <input name="deposit" type="number" min="0" step="1" value={deposit} onChange={(e) => setDeposit(e.target.value)} className="field" />
            </div>
            <div>
              <label className="label">Invoicing</label>
              <select name="invoice_mode" value={invoiceMode} onChange={(e) => setInvoiceMode(e.target.value)} className="field">
                <option value="scheduled">First now, rest before each</option>
                <option value="upfront">All up front</option>
              </select>
            </div>
          </div>

          {renderTenantPicker(seriesTotal === 0)}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-ink-soft">
              Rental {formatMoney(rental)} × {series.length} + deposit {formatMoney(Number(deposit) || 0)} ={" "}
              <span className="text-lg font-semibold text-ink">{formatMoney(seriesTotal)}</span>
              {seriesTotal === 0 ? (
                <span className="ml-2 rounded-full border border-verde-deep/40 bg-verde/40 px-2 py-0.5 text-xs font-semibold text-verde-deep">
                  Free — no invoices
                </span>
              ) : null}
            </div>
            <div className="flex gap-2">
              <DenyDialog bookingId={holder.id} clientName={holder.client_name} denyAction={denyAction} />
              <SubmitButton formAction={approveSeriesAction} pendingLabel="Approving…" variant="accent">
                {seriesTotal === 0 ? "Approve series as free" : "Approve series & invoice"}
              </SubmitButton>
            </div>
          </div>
        </form>
      </div>
    );
  }

  const detail = (label, value) =>
    value ? (
      <div className="flex justify-between gap-4 py-1.5">
        <dt className="text-ink-muted">{label}</dt>
        <dd className="text-right font-medium text-ink">{value}</dd>
      </div>
    ) : null;

  return (
    <div className="card animate-fade-in-up p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-verde-deep">
            {spaceName(booking.space)}
            {booking.is_public_event ? (
              <span className="rounded-full border border-verde-deep/30 bg-verde-deep/15 px-2 py-0.5 text-[10px] normal-case tracking-normal text-verde-deep">
                Wants calendar listing
              </span>
            ) : null}
          </div>
          <h3 className="mt-1 text-xl font-semibold text-ink">
            {booking.client_name}
          </h3>
          <p className="text-sm text-ink-muted">
            {formatDate(booking.date)} · {formatTime(booking.start_time)} ·{" "}
            {booking.hours}h
          </p>
          <Link
            href={`/admin/requests?b=${booking.id}`}
            scroll={false}
            className="mt-1 inline-block text-xs font-medium text-verde-deep hover:underline"
          >
            View activity →
          </Link>
        </div>
        <div className="text-right text-sm">
          <a href={`mailto:${booking.client_email}`} className="block font-medium text-verde-deep hover:underline">
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
      <form className="mt-5 border-t border-line pt-5">
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

        {renderTenantPicker(isFree)}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-ink-soft">
            Rental {formatMoney(rental)}
            {Number(sessions) > 1 ? ` (${sessions} sessions)` : ""} + deposit{" "}
            {formatMoney(Number(deposit) || 0)} ={" "}
            <span className="text-lg font-semibold text-ink">
              {formatMoney(total)}
            </span>
            {isFree ? (
              <span className="ml-2 rounded-full border border-verde-deep/40 bg-verde/40 px-2 py-0.5 text-xs font-semibold text-verde-deep">
                Free — no invoice
              </span>
            ) : null}
          </div>
          <div className="flex gap-2">
            {/* Deny opens a dialog (its own form) to capture the reason. */}
            <DenyDialog
              bookingId={booking.id}
              clientName={booking.client_name}
              denyAction={denyAction}
            />
            <SubmitButton
              formAction={approveAction}
              pendingLabel="Approving…"
              variant="accent"
            >
              {isFree ? "Approve as free booking" : "Approve & send payment link"}
            </SubmitButton>
          </div>
        </div>
      </form>
    </div>
  );
}

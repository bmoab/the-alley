"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  SPACES,
  EVENT_TYPES,
  GUEST_RANGES,
  formatMoney,
  formatDate,
  formatTime,
} from "@/lib/constants.js";
import { submitBooking } from "@/app/(site)/book/actions.js";

const STEPS = ["Space", "Date & time", "Details", "Review"];

export default function BookingFlow({ settings }) {
  const rate = Number(settings.standard_rate || 75);
  const deposit = Number(settings.deposit || 150);
  const minHours = Number(settings.minimum_hours || 2);

  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    space: "",
    date: "",
    hours: minHours,
    start_time: "",
    client_name: "",
    client_email: "",
    client_phone: "",
    event_type: "",
    guests: "",
    alcohol: "no",
    notes: "",
    is_recurring: "no",
    recurring_schedule: "",
    is_public_event: "no",
    agreed: false,
  });
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitState, setSubmitState] = useState({ status: "idle", error: "", id: null });

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  // Load availability whenever space / date / hours change on step 2.
  useEffect(() => {
    if (step !== 1 || !form.space || !form.date) {
      setSlots([]);
      return;
    }
    let cancelled = false;
    setLoadingSlots(true);
    fetch(`/api/availability?space=${form.space}&date=${form.date}&hours=${form.hours}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setSlots(data.slots || []);
      })
      .catch(() => !cancelled && setSlots([]))
      .finally(() => !cancelled && setLoadingSlots(false));
    return () => {
      cancelled = true;
    };
  }, [step, form.space, form.date, form.hours]);

  // Clear a chosen start time if it's no longer valid for the new duration/date.
  useEffect(() => {
    if (form.start_time && !slots.find((s) => s.time === form.start_time && s.available)) {
      set({ start_time: "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots]);

  const today = new Date();
  const minDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const rentalCost = rate * Number(form.hours || 0);
  const estTotal = rentalCost + deposit;

  function canAdvance() {
    if (step === 0) return !!form.space;
    if (step === 1) return !!form.date && !!form.start_time && Number(form.hours) >= minHours;
    if (step === 2)
      return (
        form.client_name.trim() &&
        form.client_email.trim() &&
        form.client_phone.trim() &&
        form.agreed
      );
    return true;
  }

  async function handleSubmit() {
    setSubmitState({ status: "submitting", error: "", id: null });
    const res = await submitBooking({
      ...form,
      hours: Number(form.hours),
      alcohol: form.alcohol === "yes",
      is_recurring: form.is_recurring === "yes",
      is_public_event: form.is_public_event === "yes",
      agreed: !!form.agreed,
    });
    if (res.ok) {
      setSubmitState({ status: "done", error: "", id: res.id });
    } else {
      setSubmitState({ status: "error", error: res.error, id: null });
    }
  }

  // ---- Confirmation screen ----
  if (submitState.status === "done") {
    return (
      <div className="card mx-auto max-w-xl p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brass/15 text-2xl text-brass-dark">✓</div>
        <h2 className="mt-4 font-display text-2xl font-semibold text-ink">Request received</h2>
        <p className="mt-3 text-ink-muted">
          Thank you, {form.client_name.split(" ")[0]}! We&apos;ve received your
          request for {SPACES.find((s) => s.id === form.space)?.name} on{" "}
          {formatDate(form.date)}. <strong>No charge has been made.</strong> We&apos;ll
          review it and email you within 24 hours with approval and a payment
          link.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/" className="btn-ghost">Back home</Link>
          <Link href="/events" className="btn-primary">Browse events</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      {/* Stepper */}
      <ol className="mb-8 flex items-center justify-between">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 items-center">
            <div className="flex items-center gap-2">
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                  i <= step ? "bg-ink text-paper" : "bg-paper-warm text-ink-muted"
                }`}
              >
                {i + 1}
              </span>
              <span className={`hidden text-sm font-semibold sm:block ${i <= step ? "text-ink" : "text-ink-muted"}`}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 ? (
              <span className={`mx-2 h-px flex-1 ${i < step ? "bg-ink" : "bg-ink/15"}`} />
            ) : null}
          </li>
        ))}
      </ol>

      <div className="card p-6 sm:p-8">
        {/* STEP 1 — Space */}
        {step === 0 ? (
          <div>
            <h2 className="font-display text-2xl font-semibold text-ink">Choose your space</h2>
            <p className="mt-1 text-ink-muted">Both spaces are {formatMoney(rate)}/hour with a {minHours}-hour minimum.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {SPACES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => set({ space: s.id })}
                  className={`rounded-2xl border-2 p-5 text-left transition ${
                    form.space === s.id ? "border-brass bg-brass/5" : "border-ink/10 hover:border-ink/30"
                  }`}
                >
                  <div className="text-xs font-semibold uppercase tracking-wider text-brass-dark">
                    {s.location} · {s.capacity}
                  </div>
                  <div className="mt-1 font-display text-xl font-semibold text-ink">{s.name}</div>
                  <p className="mt-2 text-sm text-ink-muted">{s.blurb}</p>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* STEP 2 — Date & time */}
        {step === 1 ? (
          <div>
            <h2 className="font-display text-2xl font-semibold text-ink">Pick a date &amp; time</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Date</label>
                <input
                  type="date"
                  min={minDate}
                  value={form.date}
                  onChange={(e) => set({ date: e.target.value, start_time: "" })}
                  className="field"
                />
              </div>
              <div>
                <label className="label">Duration</label>
                <select
                  value={form.hours}
                  onChange={(e) => set({ hours: Number(e.target.value), start_time: "" })}
                  className="field"
                >
                  {Array.from({ length: 8 - minHours + 1 }, (_, i) => minHours + i).map((h) => (
                    <option key={h} value={h}>{h} hours</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-5">
              <label className="label">Available start times</label>
              {!form.date ? (
                <p className="text-sm text-ink-muted">Choose a date to see available times.</p>
              ) : loadingSlots ? (
                <p className="text-sm text-ink-muted">Checking availability…</p>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {slots.map((s) => (
                    <button
                      key={s.time}
                      disabled={!s.available}
                      onClick={() => set({ start_time: s.time })}
                      className={`rounded-lg border px-2 py-2 text-sm transition ${
                        form.start_time === s.time
                          ? "border-brass bg-brass text-white"
                          : s.available
                          ? "border-ink/15 hover:border-ink/40"
                          : "cursor-not-allowed border-ink/5 bg-paper-warm text-ink-muted/40 line-through"
                      }`}
                      title={s.available ? "" : "Already booked"}
                    >
                      {formatTime(s.time)}
                    </button>
                  ))}
                </div>
              )}
              {form.date && !loadingSlots && slots.every((s) => !s.available) ? (
                <p className="mt-2 text-sm text-rust">
                  No openings of this length on that day — try a shorter duration or another date.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* STEP 3 — Details */}
        {step === 2 ? (
          <div>
            <h2 className="font-display text-2xl font-semibold text-ink">Tell us about your event</h2>
            <div className="mt-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label">Full name *</label>
                  <input className="field" value={form.client_name} onChange={(e) => set({ client_name: e.target.value })} />
                </div>
                <div>
                  <label className="label">Phone *</label>
                  <input className="field" value={form.client_phone} onChange={(e) => set({ client_phone: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="label">Email *</label>
                <input type="email" className="field" value={form.client_email} onChange={(e) => set({ client_email: e.target.value })} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label">Type of event</label>
                  <select className="field" value={form.event_type} onChange={(e) => set({ event_type: e.target.value })}>
                    <option value="">Select…</option>
                    {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Expected guests</label>
                  <select className="field" value={form.guests} onChange={(e) => set({ guests: e.target.value })}>
                    <option value="">Select…</option>
                    {GUEST_RANGES.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label">Will alcohol be served?</label>
                  <select className="field" value={form.alcohol} onChange={(e) => set({ alcohol: e.target.value })}>
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </div>
                <div>
                  <label className="label">Is this a recurring event?</label>
                  <select className="field" value={form.is_recurring} onChange={(e) => set({ is_recurring: e.target.value })}>
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </div>
              </div>
              {form.is_recurring === "yes" ? (
                <div>
                  <label className="label">How often &amp; for how long? (up to 1 month)</label>
                  <input className="field" placeholder="e.g. Every Tuesday for 4 weeks" value={form.recurring_schedule} onChange={(e) => set({ recurring_schedule: e.target.value })} />
                </div>
              ) : null}
              <div>
                <label className="label">Anything else we should know?</label>
                <textarea rows={3} className="field" value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
              </div>

              <div className="rounded-xl border border-ink/10 bg-paper-warm p-4">
                <label className="flex cursor-pointer items-start gap-3">
                  <input type="checkbox" className="mt-1" checked={form.is_public_event === "yes"} onChange={(e) => set({ is_public_event: e.target.checked ? "yes" : "no" })} />
                  <span className="text-sm text-ink-soft">
                    <strong>Is this a public class/event you&apos;d like listed on our calendar?</strong>
                    <br />
                    If yes, once your booking is confirmed we&apos;ll email you a private
                    link to post your event on The Alley&apos;s public calendar.
                  </span>
                </label>
              </div>

              <div className="rounded-xl border border-ink/10 p-4">
                <label className="flex cursor-pointer items-start gap-3">
                  <input type="checkbox" className="mt-1" checked={form.agreed} onChange={(e) => set({ agreed: e.target.checked })} />
                  <span className="text-sm text-ink-soft">
                    I agree to The Alley&apos;s{" "}
                    <a href="/rental-agreement.pdf" target="_blank" rel="noreferrer" className="font-semibold text-brass-dark hover:underline">
                      rental terms
                    </a>
                    . *
                  </span>
                </label>
              </div>
            </div>
          </div>
        ) : null}

        {/* STEP 4 — Review */}
        {step === 3 ? (
          <div>
            <h2 className="font-display text-2xl font-semibold text-ink">Review your request</h2>
            <dl className="mt-5 divide-y divide-ink/10 text-sm">
              {[
                ["Space", SPACES.find((s) => s.id === form.space)?.name],
                ["Date", formatDate(form.date)],
                ["Time", `${formatTime(form.start_time)} · ${form.hours} hours`],
                ["Name", form.client_name],
                ["Email", form.client_email],
                ["Phone", form.client_phone],
                ["Event type", form.event_type || "—"],
                ["Guests", form.guests || "—"],
                ["Alcohol", form.alcohol === "yes" ? "Yes" : "No"],
                ["Recurring", form.is_recurring === "yes" ? form.recurring_schedule || "Yes" : "No"],
                ["List on calendar", form.is_public_event === "yes" ? "Yes" : "No"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-2">
                  <dt className="text-ink-muted">{k}</dt>
                  <dd className="text-right font-medium text-ink">{v}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-5 rounded-xl bg-paper-warm p-5">
              <div className="flex justify-between text-sm text-ink-soft">
                <span>Rental ({formatMoney(rate)} × {form.hours}h)</span>
                <span>{formatMoney(rentalCost)}</span>
              </div>
              <div className="mt-1 flex justify-between text-sm text-ink-soft">
                <span>Refundable cleaning deposit</span>
                <span>{formatMoney(deposit)}</span>
              </div>
              <div className="mt-3 flex justify-between border-t border-ink/10 pt-3 font-display text-lg font-semibold text-ink">
                <span>Estimated total</span>
                <span>{formatMoney(estTotal)}</span>
              </div>
              <p className="mt-3 text-xs text-ink-muted">
                This is an estimate. <strong>No charge happens now.</strong> If approved,
                you&apos;ll receive a payment link and your final price (the owner may
                adjust pricing, e.g. for recurring bookings).
              </p>
            </div>

            {submitState.status === "error" ? (
              <div className="mt-4 rounded-lg border border-rust/30 bg-rust/10 px-4 py-3 text-sm text-rust">
                {submitState.error}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Nav buttons */}
        <div className="mt-8 flex items-center justify-between">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="btn-ghost disabled:invisible"
          >
            ← Back
          </button>
          {step < STEPS.length - 1 ? (
            <button onClick={() => setStep((s) => s + 1)} disabled={!canAdvance()} className="btn-primary disabled:opacity-40">
              Continue →
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={submitState.status === "submitting"} className="btn-accent disabled:opacity-60">
              {submitState.status === "submitting" ? "Submitting…" : "Submit request"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

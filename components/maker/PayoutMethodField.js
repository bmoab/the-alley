"use client";
import { useState } from "react";
import { PAYOUT_KINDS, parsePayout, joinPayout } from "@/lib/payout.js";

/**
 * How someone likes to be paid: pick Venmo, Zelle, check… then the username,
 * number or address that goes with it. Posts one line as `name`.
 */
export default function PayoutMethodField({ name = "payout_method", defaultValue = "", label = "How you'd like to be paid", id = "payout" }) {
  const start = parsePayout(defaultValue);
  const [kind, setKind] = useState(start.kind);
  const [handle, setHandle] = useState(start.handle);
  const k = PAYOUT_KINDS.find((x) => x.key === kind);

  return (
    <div>
      <p className="label">{label}</p>
      <input type="hidden" name={name} value={joinPayout(kind, handle)} />
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {PAYOUT_KINDS.map((x) => (
          <button
            key={x.key}
            type="button"
            role="radio"
            aria-checked={kind === x.key}
            onClick={() => setKind(kind === x.key ? "" : x.key)}
            className={`rounded-full border px-3 py-1 text-sm font-semibold transition ${
              kind === x.key ? "border-ink bg-ink text-paper" : "border-line-strong bg-paper text-ink-soft hover:text-ink"
            }`}
          >
            {x.key}
          </button>
        ))}
      </div>
      {k ? (
        <div className="mt-3">
          <label className="label" htmlFor={`${id}-handle`}>
            {k.label}
          </label>
          <input
            id={`${id}-handle`}
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            className="field"
            placeholder={k.placeholder}
            autoComplete="off"
          />
        </div>
      ) : null}
    </div>
  );
}

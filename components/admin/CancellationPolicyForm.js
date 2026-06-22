"use client";
import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import Card from "@/components/admin/ui/Card.js";
import Button from "@/components/admin/ui/Button.js";

const REFUND_OPTIONS = [
  { value: "full", label: "Full refund (rental + deposit)" },
  { value: "deposit_only", label: "Deposit only (rental forfeited)" },
  { value: "none", label: "No refund" },
];

/**
 * Cancellation policy settings. Has its own save action (separate from the main
 * settings form) and requires the owner to acknowledge that editing these does
 * NOT change the rental agreement PDF before the Save button enables.
 */
export default function CancellationPolicyForm({ action, values }) {
  const [ack, setAck] = useState(false);

  return (
    <Card pad="md" as="form" action={action}>
      <h2 className="text-lg font-semibold text-ink">Cancellation &amp; refund policy</h2>
      <p className="mt-1 text-sm text-ink-muted">
        Controls the owner-initiated cancellation flow. Defaults match the rental agreement.
      </p>

      <div className="mt-4 grid gap-5 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="cancellation_cutoff_hours">
            Cancellation cutoff (hours before event)
          </label>
          <input
            id="cancellation_cutoff_hours"
            name="cancellation_cutoff_hours"
            type="number"
            min={0}
            step={1}
            defaultValue={values.cancellation_cutoff_hours ?? "72"}
            className="field"
          />
        </div>
        <div>
          <label className="label" htmlFor="refund_before_cutoff">
            More than cutoff before
          </label>
          <select
            id="refund_before_cutoff"
            name="refund_before_cutoff"
            defaultValue={values.refund_before_cutoff ?? "full"}
            className="field"
          >
            {REFUND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="refund_within_cutoff">
            Within cutoff
          </label>
          <select
            id="refund_within_cutoff"
            name="refund_within_cutoff"
            defaultValue={values.refund_within_cutoff ?? "deposit_only"}
            className="field"
          >
            {REFUND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Acknowledgment warning */}
      <div className="mt-4 flex gap-3 rounded-xl border border-rust/30 bg-rust/5 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rust" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-ink">
            Changing this does not update your rental agreement.
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            Update the contract PDF to match, or your written policy and your system will disagree.
          </p>
          <label className="mt-3 flex items-center gap-2">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            <span className="text-sm font-semibold text-ink-soft">
              I understand — I&apos;ll keep the rental agreement PDF in sync.
            </span>
          </label>
        </div>
      </div>

      <div className="mt-4">
        <Button type="submit" disabled={!ack}>
          Save cancellation policy
        </Button>
      </div>
    </Card>
  );
}

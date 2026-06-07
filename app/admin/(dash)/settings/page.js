import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSettings, setSetting } from "@/lib/db.js";
import { formatTime } from "@/lib/constants.js";

export const metadata = { title: "Settings" };

// Hour options 0–23 shown as friendly times for the open/close selects.
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({
  value: String(h),
  label: formatTime(`${String(h).padStart(2, "0")}:00`),
}));

// Each field maps to a key seeded in lib/db.js (seedDefaults).
const NUMBER_FIELDS = [
  {
    key: "standard_rate",
    label: "Standard rate ($ per hour)",
    hint: "Default hourly rate for both spaces. You can still adjust it per request.",
    min: 0,
    step: 5,
  },
  {
    key: "deposit",
    label: "Refundable cleaning deposit ($)",
    hint: "Added as a separate line on every invoice and refunded after the event.",
    min: 0,
    step: 5,
  },
  {
    key: "minimum_hours",
    label: "Minimum booking length (hours)",
    hint: "Shortest rental a guest can request.",
    min: 1,
    step: 1,
  },
  {
    key: "cleanup_buffer_minutes",
    label: "Cleanup buffer (minutes)",
    hint: "Gap reserved after each booking before the next can start.",
    min: 0,
    step: 15,
  },
  {
    key: "payment_window_days",
    label: "Payment window (days)",
    hint: "How long an approved hold lasts before it expires unpaid.",
    min: 1,
    step: 1,
  },
];

async function save(formData) {
  "use server";
  for (const f of NUMBER_FIELDS) {
    setSetting(f.key, (formData.get(f.key) || "0").toString());
  }
  setSetting("open_hour", (formData.get("open_hour") || "8").toString());
  setSetting("close_hour", (formData.get("close_hour") || "23").toString());
  setSetting(
    "listing_auto_publish",
    formData.get("listing_auto_publish") === "true" ? "true" : "false"
  );
  revalidatePath("/admin/settings");
  revalidatePath("/book");
  redirect("/admin/settings?saved=1");
}

export default function SettingsPage({ searchParams }) {
  const s = getSettings();
  const saved = searchParams?.saved;

  return (
    <div>
      <p className="eyebrow">Admin</p>
      <h1 className="font-display text-3xl font-semibold text-ink">Settings</h1>
      <p className="mt-1 text-ink-muted">
        Pricing, hours, and booking rules. Changes apply to new requests
        immediately.
      </p>

      {saved ? (
        <div className="mt-4 rounded-lg border border-brass/30 bg-brass/10 px-4 py-2 text-sm text-brass-dark">
          Saved. Your settings are updated.
        </div>
      ) : null}

      <form action={save} className="mt-6 space-y-5">
        <div className="card p-5">
          <h2 className="font-display text-lg font-semibold text-ink">Pricing</h2>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            {NUMBER_FIELDS.filter((f) =>
              ["standard_rate", "deposit"].includes(f.key)
            ).map((f) => (
              <NumberField key={f.key} field={f} value={s[f.key]} />
            ))}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="font-display text-lg font-semibold text-ink">
            Booking rules
          </h2>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            {NUMBER_FIELDS.filter((f) =>
              ["minimum_hours", "cleanup_buffer_minutes", "payment_window_days"].includes(
                f.key
              )
            ).map((f) => (
              <NumberField key={f.key} field={f} value={s[f.key]} />
            ))}
            <div>
              <label className="label" htmlFor="open_hour">
                Opens at
              </label>
              <select
                id="open_hour"
                name="open_hour"
                defaultValue={s.open_hour ?? "8"}
                className="field"
              >
                {HOUR_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="close_hour">
                Closes at
              </label>
              <select
                id="close_hour"
                name="close_hour"
                defaultValue={s.close_hour ?? "23"}
                className="field"
              >
                {HOUR_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="card p-5">
          <h2 className="font-display text-lg font-semibold text-ink">
            Public events
          </h2>
          <div className="mt-4">
            <label className="label" htmlFor="listing_auto_publish">
              Auto-publish host event listings
            </label>
            <select
              id="listing_auto_publish"
              name="listing_auto_publish"
              defaultValue={s.listing_auto_publish === "true" ? "true" : "false"}
              className="field"
            >
              <option value="false">No — review each listing before it goes live</option>
              <option value="true">Yes — publish to the calendar automatically</option>
            </select>
            <p className="mt-1 text-xs text-ink-muted">
              When off, host submissions wait for your approval in the Events tab.
            </p>
          </div>
        </div>

        <button type="submit" className="btn-primary">
          Save changes
        </button>
      </form>
    </div>
  );
}

function NumberField({ field, value }) {
  return (
    <div>
      <label className="label" htmlFor={field.key}>
        {field.label}
      </label>
      <input
        id={field.key}
        name={field.key}
        type="number"
        min={field.min}
        step={field.step}
        defaultValue={value ?? ""}
        className="field"
      />
      {field.hint ? (
        <p className="mt-1 text-xs text-ink-muted">{field.hint}</p>
      ) : null}
    </div>
  );
}

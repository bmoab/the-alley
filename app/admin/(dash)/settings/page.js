import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSettings, setSetting, getContentValue, setContent } from "@/lib/db.js";
import { formatTime, SPACES } from "@/lib/constants.js";
import { spaceSettingKey, spaceCapacityKey, spaceOverride, globalRule } from "@/lib/spaces.js";
import { logActivity } from "@/lib/activity.js";
import { getActor } from "@/lib/auth.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import Card from "@/components/admin/ui/Card.js";
import Button from "@/components/admin/ui/Button.js";
import CancellationPolicyForm from "@/components/admin/CancellationPolicyForm.js";

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
    hint: "Default hourly rate, used by any space without its own rate below. You can still adjust it per request.",
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
  // Minimum / maximum booking length and the cleanup buffer used to live here
  // too, duplicating the per-space boxes below that silently inherited them.
  // They're now set per space only. The global keys still exist in `settings`
  // as the fallback for a space with an empty box (see lib/spaces.js) — they
  // just aren't edited from here any more.
  {
    key: "min_lead_hours",
    label: "Minimum advance notice (hours)",
    hint: "How far ahead a booking must be made. 0 = no requirement; 24 = one day; 48 = two days.",
    min: 0,
    step: 1,
  },
  {
    key: "payment_window_days",
    label: "Payment window (days)",
    hint: "How long an approved hold lasts before it expires unpaid.",
    min: 1,
    step: 1,
  },
  {
    key: "series_invoice_lead_days",
    label: "Recurring invoice lead time (days)",
    hint: "For recurring bookings, the first session's invoice is sent as soon as you approve. Each remaining session is invoiced this many days before it.",
    min: 0,
    step: 1,
  },
  {
    key: "series_max_occurrences",
    label: "Max sessions per recurring request",
    hint: "The most sessions a guest can request in one recurring booking.",
    min: 2,
    step: 1,
  },
  {
    key: "series_max_span_days",
    label: "Max span of a recurring request (days)",
    hint: "Recurring sessions must all fall within this many days (e.g. 31 ≈ one month).",
    min: 1,
    step: 1,
  },
];

// Rules a single space can override. Blank = that space inherits the matching
// default above. Field names double as the settings key (space_<id>_<key>), so
// saving is a straight pass-through. See lib/spaces.js.
const SPACE_FIELDS = [
  { key: "standard_rate", label: "Rate ($ per hour)", fallback: "75", min: 0, step: 5 },
  { key: "deposit", label: "Deposit ($)", fallback: "150", min: 0, step: 5 },
  { key: "minimum_hours", label: "Minimum (hours)", fallback: "2", min: 1, step: 1 },
  { key: "maximum_hours", label: "Maximum (hours)", fallback: "8", min: 1, step: 1 },
  { key: "cleanup_buffer_minutes", label: "Cleanup buffer (minutes)", fallback: "60", min: 0, step: 15 },
];

async function save(formData) {
  "use server";
  for (const f of NUMBER_FIELDS) {
    // Only write what this form actually rendered. A field that isn't on the
    // page posts nothing, and the old `|| "0"` would quietly stamp a 0 over a
    // real setting.
    const submitted = formData.get(f.key);
    if (submitted === null) continue;
    setSetting(f.key, submitted.toString() || "0");
  }
  // Per-space overrides. An empty box is stored as "" — spaceRules() reads that
  // as "inherit", so clearing a field puts the space back on the default.
  for (const sp of SPACES) {
    for (const f of SPACE_FIELDS) {
      const name = spaceSettingKey(sp.id, f.key);
      setSetting(name, (formData.get(name) ?? "").toString().trim());
    }
    const capKey = spaceCapacityKey(sp.id);
    setContent(capKey, (formData.get(capKey) || "").toString().trim());
  }
  setSetting("open_hour", (formData.get("open_hour") || "8").toString());
  setSetting("close_hour", (formData.get("close_hour") || "23").toString());
  setSetting(
    "listing_auto_publish",
    formData.get("listing_auto_publish") === "true" ? "true" : "false"
  );
  // Shared calendar link is content (used in tenant/host/exhibitor invite emails).
  setContent("calendar_share_url", (formData.get("calendar_share_url") || "").toString());
  // Notification routing (lib/notify.js). Plain text, NOT part of NUMBER_FIELDS —
  // that loop's `|| "0"` fallback would turn a cleared box into the string "0"
  // and quietly send every notification to a nonexistent address.
  for (const key of ["notify_requests", "notify_reminders", "reply_to_email"]) {
    setSetting(key, (formData.get(key) || "").toString().trim());
  }
  logActivity({
    eventType: "settings_changed",
    description: "Settings updated · pricing & booking rules",
    ...(await getActor()),
  });
  revalidatePath("/admin/settings");
  revalidatePath("/book");
  revalidatePath("/spaces");
  revalidatePath("/");
  redirect("/admin/settings?saved=1");
}

const REFUND_VALUES = ["full", "deposit_only", "none"];

async function saveCancellationPolicy(formData) {
  "use server";
  const hours = Math.max(0, Number(formData.get("cancellation_cutoff_hours")) || 0);
  const before = formData.get("refund_before_cutoff");
  const within = formData.get("refund_within_cutoff");
  setSetting("cancellation_cutoff_hours", String(hours));
  setSetting("refund_before_cutoff", REFUND_VALUES.includes(before) ? before : "full");
  setSetting("refund_within_cutoff", REFUND_VALUES.includes(within) ? within : "deposit_only");
  logActivity({
    eventType: "settings_changed",
    description: `Cancellation policy updated · ${hours}h cutoff`,
    ...(await getActor()),
  });
  revalidatePath("/admin/settings");
  redirect("/admin/settings?toast=" + encodeURIComponent("Cancellation policy saved.") + "&toastType=success");
}

export default function SettingsPage() {
  const s = getSettings();
  const calendarShareUrl = getContentValue("calendar_share_url", "");

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Pricing, hours, and booking rules. Changes apply to new requests immediately."
      />

      <form action={save} className="space-y-5">
        <Card pad="md">
          <h2 className="text-lg font-semibold text-ink">Pricing</h2>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            {NUMBER_FIELDS.filter((f) =>
              ["standard_rate", "deposit"].includes(f.key)
            ).map((f) => (
              <NumberField key={f.key} field={f} value={s[f.key]} />
            ))}
          </div>
        </Card>

        <Card pad="md">
          <h2 className="text-lg font-semibold text-ink">Booking rules</h2>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            {NUMBER_FIELDS.filter((f) =>
              ["min_lead_hours", "payment_window_days"].includes(f.key)
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
        </Card>

        <Card pad="md">
          <h2 className="text-lg font-semibold text-ink">Per-space rules</h2>
          <p className="mt-1 text-xs text-ink-muted">
            Booking length and the gap between bookings are set here, per space — each
            room can differ. Rate and deposit fall back to the Pricing card above when
            left empty; an empty box always uses the value shown in grey.
          </p>
          <div className="mt-4 space-y-6">
            {SPACES.map((sp) => (
              <div key={sp.id} className="rounded-lg border border-line bg-paper-dim p-4">
                <h3 className="text-sm font-semibold text-ink">{sp.name}</h3>
                <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {SPACE_FIELDS.map((f) => {
                    const name = spaceSettingKey(sp.id, f.key);
                    return (
                      <div key={f.key}>
                        <label className="label" htmlFor={name}>
                          {f.label}
                        </label>
                        <input
                          id={name}
                          name={name}
                          type="number"
                          min={f.min}
                          step={f.step}
                          defaultValue={spaceOverride(sp.id, f.key)}
                          placeholder={`${globalRule(f.key, f.fallback)} (default)`}
                          className="field"
                        />
                      </div>
                    );
                  })}
                  <div>
                    <label className="label" htmlFor={spaceCapacityKey(sp.id)}>
                      Capacity (shown on the site)
                    </label>
                    <input
                      id={spaceCapacityKey(sp.id)}
                      name={spaceCapacityKey(sp.id)}
                      type="text"
                      defaultValue={getContentValue(spaceCapacityKey(sp.id), "")}
                      placeholder={sp.capacity || "e.g. Seats up to 12"}
                      className="field"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card pad="md">
          <h2 className="text-lg font-semibold text-ink">Recurring bookings</h2>
          <p className="mt-1 text-xs text-ink-muted">
            For a recurring series, one cleaning deposit covers the whole series and each
            session is billed on its own invoice (so cancelling one session is a clean refund).
          </p>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            {NUMBER_FIELDS.filter((f) =>
              ["series_invoice_lead_days", "series_max_occurrences", "series_max_span_days"].includes(f.key)
            ).map((f) => (
              <NumberField key={f.key} field={f} value={s[f.key]} />
            ))}
          </div>
        </Card>

        <Card pad="md">
          <h2 className="text-lg font-semibold text-ink">Public events</h2>
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
        </Card>

        <Card pad="md">
          <h2 className="text-lg font-semibold text-ink">Notifications</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Where the Alley&rsquo;s own emails go. Separate several addresses with commas.
            Leave a box empty to fall back to the site&rsquo;s default address.
          </p>
          <div className="mt-4 space-y-5">
            <div>
              <label className="label" htmlFor="notify_requests">
                Requests &amp; approvals
              </label>
              <input
                id="notify_requests"
                name="notify_requests"
                type="text"
                defaultValue={s.notify_requests ?? ""}
                placeholder="name@example.com, someone@example.com"
                className="field"
              />
              <p className="mt-1 text-xs text-ink-muted">
                New booking requests, the daily &ldquo;still waiting for review&rdquo; nudge,
                deposits to resolve, and any date change a client makes themselves.
              </p>
            </div>
            <div>
              <label className="label" htmlFor="notify_reminders">
                Event reminders
              </label>
              <input
                id="notify_reminders"
                name="notify_reminders"
                type="text"
                defaultValue={s.notify_reminders ?? ""}
                placeholder="name@example.com, someone@example.com"
                className="field"
              />
              <p className="mt-1 text-xs text-ink-muted">
                The &ldquo;happening soon&rdquo; digests — everything booked in the building,
                including private bookings that never hit the public calendar.
              </p>
            </div>
            <div>
              <label className="label" htmlFor="reply_to_email">
                Client replies go to
              </label>
              <input
                id="reply_to_email"
                name="reply_to_email"
                type="email"
                defaultValue={s.reply_to_email ?? ""}
                placeholder="thealleyoncenter@gmail.com"
                className="field"
              />
              <p className="mt-1 text-xs text-ink-muted">
                One address. When a client hits reply on any email from the site, this
                is where it lands.
              </p>
            </div>
          </div>
        </Card>

        <Card pad="md">
          <h2 className="text-lg font-semibold text-ink">Shared links</h2>
          <div className="mt-4">
            <label className="label" htmlFor="calendar_share_url">
              Shared calendar link (Google Calendar)
            </label>
            <input
              id="calendar_share_url"
              name="calendar_share_url"
              type="url"
              defaultValue={calendarShareUrl}
              placeholder="https://calendar.google.com/calendar/u/0?cid=…"
              className="field"
            />
            <p className="mt-1 text-xs text-ink-muted">
              Included in tenant, host, and exhibitor invite emails so they can add the building calendar.
            </p>
          </div>
        </Card>

        <Button type="submit">Save changes</Button>
      </form>

      <div className="mt-5">
        <CancellationPolicyForm action={saveCancellationPolicy} values={s} />
      </div>
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

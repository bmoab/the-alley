/**
 * An on/off switch that posts like a checkbox (`name` is "on" when switched
 * on). A label on the left, an optional line under it.
 */
export default function Toggle({ name, defaultChecked = false, label, hint }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-ink-muted">{hint}</span> : null}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input type="checkbox" name={name} defaultChecked={defaultChecked} className="peer sr-only" />
        <span className="h-6 w-11 rounded-full bg-ink/15 transition-colors peer-checked:bg-verde-deep peer-focus-visible:ring-2 peer-focus-visible:ring-verde-deep/40 peer-focus-visible:ring-offset-1" />
        <span className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

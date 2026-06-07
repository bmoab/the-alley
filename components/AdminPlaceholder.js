export default function AdminPlaceholder({ title, priority, blurb }) {
  return (
    <div>
      <p className="eyebrow">Admin</p>
      <h1 className="font-display text-3xl font-semibold text-ink">{title}</h1>
      <div className="mt-6 card p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-paper-warm text-brass-dark">
          <span className="text-lg">✦</span>
        </div>
        <h2 className="mt-4 font-display text-xl font-semibold text-ink">
          Coming up next
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
          {blurb}
        </p>
        {priority ? (
          <p className="mt-4 inline-block rounded-full bg-paper-warm px-3 py-1 text-xs font-semibold text-ink-soft">
            Build priority #{priority}
          </p>
        ) : null}
      </div>
    </div>
  );
}

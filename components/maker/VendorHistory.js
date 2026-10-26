import Link from "next/link";

const when = (at) => {
  const s = String(at || "");
  // A bare day (venue-local) has no time to show.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(`${s}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  return new Date(`${s.replace(" ", "T")}Z`).toLocaleString("en-US", {
    timeZone: "America/Denver",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const DOT = {
  agreed: "bg-verde-deep",
  confirmed: "bg-verde-deep",
  paid: "bg-verde-deep",
  terms_updated: "bg-amber-500",
  share_changed: "bg-amber-500",
  declined: "bg-rust",
};

/**
 * A maker's or artist's record (lib/vendor-record.js vendorHistory), shared by
 * their page and ours. Agreements open to the exact words they agreed to;
 * stock sheets open to what was counted in (or link to the sheet, for us).
 */
export default function VendorHistory({ rows, agreements = [], intakes = {}, intakeHref = null, limit = 12 }) {
  if (!rows.length) return <p className="mt-2 text-sm text-ink-muted">Nothing yet.</p>;
  const byId = Object.fromEntries(agreements.map((a) => [a.id, a]));
  const item = (r, i) => {
    const agreement = r.agreementId ? byId[r.agreementId] : null;
    const lines = r.intakeId && r.kind === "received" ? intakes[r.intakeId] : null;
    return (
      <li key={`${r.kind}-${r.at}-${i}`} className="relative py-2.5 pl-5">
        <span className={`absolute left-0 top-[1.05rem] h-2 w-2 rounded-full ${DOT[r.kind] || "bg-line-strong"}`} aria-hidden="true" />
        <p className="text-sm text-ink">
          {intakeHref && r.intakeId ? (
            <Link href={intakeHref(r.intakeId)} className="hover:underline">
              {r.title}
            </Link>
          ) : (
            r.title
          )}
        </p>
        <p className="text-xs text-ink-muted">
          {when(r.at)}
          {r.detail ? ` · ${r.detail}` : ""}
          {r.by ? ` · by ${r.by}` : ""}
        </p>
        {agreement ? (
          <details className="mt-1">
            <summary className="cursor-pointer text-xs font-semibold text-verde-deep">The exact terms agreed to</summary>
            <div className="mt-2 max-h-72 overflow-y-auto whitespace-pre-line rounded-lg bg-paper-dim p-3 text-xs text-ink-soft">
              {agreement.text}
            </div>
          </details>
        ) : null}
        {lines?.length ? (
          <details className="mt-1">
            <summary className="cursor-pointer text-xs font-semibold text-verde-deep">What was counted in</summary>
            <ul className="mt-1 text-xs text-ink-soft">
              {lines.map((l) => (
                <li key={l.id} className="flex justify-between gap-3 border-b border-line/60 py-1">
                  <span className="min-w-0 truncate">{l.name}</span>
                  <span className="shrink-0 tabular-nums">
                    {l.qty} × ${Number(l.price).toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </li>
    );
  };
  const first = rows.slice(0, limit);
  const rest = rows.slice(limit);
  return (
    <>
      <ul className="mt-2 divide-y divide-line/60">{first.map(item)}</ul>
      {rest.length ? (
        <details className="mt-1">
          <summary className="cursor-pointer text-sm font-semibold text-ink-muted">Earlier ({rest.length})</summary>
          <ul className="divide-y divide-line/60">{rest.map((r, i) => item(r, i + limit))}</ul>
        </details>
      ) : null}
    </>
  );
}

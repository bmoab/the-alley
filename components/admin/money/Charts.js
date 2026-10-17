import Link from "next/link";
import { formatMoney } from "@/lib/constants.js";

const short = (m) => new Date(`${m}-15T12:00:00`).toLocaleDateString("en-US", { month: "short" });
const compact = (n) => {
  const a = Math.abs(n);
  const s = a >= 1000 ? `$${(a / 1000).toFixed(a >= 10000 ? 0 : 1)}k` : `$${Math.round(a)}`;
  return n < 0 ? `−${s}` : s;
};

/**
 * Twelve months side by side: money in (green) and out (grey) as bars, and
 * what was left as a dot — above the line made money, below lost it. Each
 * month is a link to that month.
 */
export function TrendChart({ data, current, href = (m) => `?month=${m}` }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.in, d.out, Math.abs(d.net)]));
  const H = 150;
  const y = (v) => H - (Math.max(0, v) / max) * H;
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[560px] gap-1.5" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}>
        {data.map((d) => {
          const on = d.month === current;
          return (
            <Link
              key={d.month}
              href={href(d.month)}
              title={`${d.month}: in ${formatMoney(d.in)} · out ${formatMoney(d.out)} · ${d.net >= 0 ? "left over" : "short"} ${formatMoney(Math.abs(d.net))}`}
              className={`group flex flex-col items-center rounded-lg px-0.5 pb-1 pt-2 transition-colors ${on ? "bg-verde/50" : "hover:bg-paper-dim"}`}
            >
              <span className={`mb-1 text-[10px] font-semibold tabular-nums ${d.net >= 0 ? "text-verde-deep" : "text-rust"}`}>
                {d.in || d.out ? compact(d.net) : "—"}
              </span>
              <svg viewBox={`0 0 24 ${H}`} className="h-[150px] w-full" preserveAspectRatio="none" aria-hidden="true">
                <rect x="2" width="9" y={y(d.in)} height={H - y(d.in)} rx="1.5" fill="#8a9472" />
                <rect x="13" width="9" y={y(d.out)} height={H - y(d.out)} rx="1.5" fill="#c8c6bd" />
              </svg>
              <span className={`mt-1 text-[11px] ${on ? "font-semibold text-ink" : "text-ink-muted"}`}>{short(d.month)}</span>
            </Link>
          );
        })}
      </div>
      <p className="mt-2 flex flex-wrap gap-4 text-xs text-ink-muted">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#8a9472]" />Money in</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#c8c6bd]" />Money out</span>
        <span>Number on top: what was left over (red = short). Tap a month to open it.</span>
      </p>
    </div>
  );
}

/** Ranked bars: label, amount, a bar to scale, and (optionally) a link to the detail. */
export function Bars({ rows, tone = "in", empty = "Nothing yet." }) {
  const shown = rows.filter((r) => r.amount);
  if (!shown.length) return <p className="text-sm text-ink-muted">{empty}</p>;
  const max = Math.max(...shown.map((r) => Math.abs(r.amount)));
  return (
    <ul className="space-y-2.5">
      {shown
        .sort((a, b) => b.amount - a.amount)
        .map((r) => {
          const inner = (
            <>
              <span className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-ink">
                  {r.label}
                  {r.note ? <span className="ml-1.5 text-xs text-ink-muted">{r.note}</span> : null}
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-ink">{formatMoney(r.amount)}</span>
              </span>
              <span className="mt-1 block h-2 overflow-hidden rounded-full bg-paper-dim">
                <span
                  className={`block h-full rounded-full ${tone === "in" ? "bg-verde-deep" : "bg-ink/35"}`}
                  style={{ width: `${Math.max(3, (Math.abs(r.amount) / max) * 100)}%` }}
                />
              </span>
            </>
          );
          return (
            <li key={r.label}>
              {r.href ? (
                <Link href={r.href} className="block rounded-lg p-1 -m-1 hover:bg-paper-dim">
                  {inner}
                </Link>
              ) : (
                inner
              )}
            </li>
          );
        })}
    </ul>
  );
}

/** The change from last month, in words and colour (a cost going up is bad, money in going up is good). */
export function Delta({ now, before, good = "up" }) {
  if (!before && !now) return null;
  const d = Math.round((now - before) * 100) / 100;
  if (Math.abs(d) < 0.5) return <span className="text-xs text-ink-muted">same as last month</span>;
  const up = d > 0;
  const isGood = good === "up" ? up : !up;
  return (
    <span className={`text-xs font-semibold ${isGood ? "text-verde-deep" : "text-rust"}`}>
      {up ? "▲" : "▼"} {formatMoney(Math.abs(d))} vs last month
    </span>
  );
}

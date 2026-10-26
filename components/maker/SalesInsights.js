"use client";
import { useMemo, useState } from "react";

/**
 * "How it's selling": a maker's best sellers for a period, by group (Large
 * Candle → each scent) or item by item, with what's left on the shelf and, if
 * they've put in their costs, their profit. Data from lib/inventory.js
 * makerInsights (or the account tour's sample). `whose` is "your" on the
 * maker's own page and "their" in the admin, which never shows costs.
 */

const money = (n) =>
  `${n < 0 ? "−" : ""}$${Math.abs(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plural = (n, word) => `${n} ${word}${Math.abs(n) === 1 ? "" : "s"}`;

function tally(items, byItem, showCost) {
  const t = { qty: 0, net: 0, share: 0, profit: 0, costed: 0, sold: 0, left: 0 };
  for (const i of items) {
    const s = byItem[i.id];
    t.left += i.left;
    if (!s) continue;
    t.qty += s.qty;
    t.net += s.net;
    t.share += s.share;
    if (s.qty) t.sold++;
    if (showCost && i.cost != null && s.qty) {
      t.profit += s.share - i.cost * s.qty;
      t.costed++;
    }
  }
  return t;
}

function Bar({ value, max }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <span className="block h-1.5 w-full bg-paper-warm" aria-hidden="true">
      <span className="block h-full bg-verde-deep transition-[width] duration-500" style={{ width: `${pct}%` }} />
    </span>
  );
}

function Figure({ label, value, hint }) {
  return (
    <div className="rounded-lg border border-line px-4 py-3">
      <p className="text-xl font-semibold tabular-nums text-ink">{value}</p>
      <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{label}</p>
      {hint ? <p className="mt-1 text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}

function Line({ name, sub, t, max, showCost, top, children, open, onToggle }) {
  const Head = onToggle ? "button" : "div";
  return (
    <li className="py-2.5">
      <Head
        {...(onToggle ? { type: "button", onClick: onToggle, "aria-expanded": open } : {})}
        className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1 text-left ${onToggle ? "group cursor-pointer" : ""}`}
      >
        <span className="min-w-0 text-sm text-ink">
          <span className={onToggle ? "font-semibold group-hover:underline" : t.qty ? "" : "text-ink-muted"}>{name}</span>
          {top ? (
            <span className="ml-2 bg-verde px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink">Best</span>
          ) : null}
          {onToggle ? <span className="ml-1.5 text-xs text-ink-muted">{open ? "▴" : "▾"}</span> : null}
        </span>
        <span className="text-right text-sm font-semibold tabular-nums text-ink">{t.qty ? `${t.qty} sold` : "None sold"}</span>
        <span className="col-span-2">
          <Bar value={t.qty} max={max} />
        </span>
        <span className="text-xs text-ink-muted">{sub}</span>
        <span className="text-right text-xs tabular-nums text-ink-soft">
          {t.qty ? money(t.share) : ""}
          {showCost && t.costed && t.qty ? ` · ${money(t.profit)} profit` : ""}
        </span>
      </Head>
      {open && children ? <ul className="mt-2 border-l-2 border-line pl-3">{children}</ul> : null}
    </li>
  );
}

export default function SalesInsights({ items, periods, months, whose = "your", showCost = false }) {
  const [periodKey, setPeriodKey] = useState(() => (Object.keys(periods.find((p) => p.key === "month")?.byItem || {}).length ? "month" : "all"));
  const [openGroups, setOpenGroups] = useState({});
  const period = periods.find((p) => p.key === periodKey) || periods[0];
  const allTime = periods.find((p) => p.key === "all");
  const Whose = whose === "your" ? "Your" : "Their";

  const entries = useMemo(() => {
    const byItem = period.byItem;
    const show = items.filter((i) => byItem[i.id] || i.active);
    const groups = {};
    const singles = [];
    for (const i of show) {
      if (i.group) (groups[i.group.toLowerCase()] ||= { name: i.group, items: [] }).items.push(i);
      else singles.push(i);
    }
    const rank = (a, b) => b.t.qty - a.t.qty || b.t.share - a.t.share || a.name.localeCompare(b.name);
    const out = [
      ...Object.values(groups).map((g) => ({
        key: `g:${g.name}`,
        name: g.name,
        group: true,
        t: tally(g.items, byItem, showCost),
        children: g.items.map((i) => ({ key: i.id, name: i.short, item: i, t: tally([i], byItem, showCost) })).sort(rank),
      })),
      ...singles.map((i) => ({ key: i.id, name: i.name, item: i, t: tally([i], byItem, showCost) })),
    ];
    return out.sort(rank);
  }, [items, period, showCost]);

  const total = tally(items, period.byItem, showCost);
  const max = Math.max(1, ...entries.map((e) => e.t.qty));
  const everSold = Object.keys(allTime?.byItem || {}).length > 0;
  const missingCost = showCost && items.some((i) => i.cost == null && period.byItem[i.id]?.qty);
  const monthMax = Math.max(1, ...months.map((m) => m.share));
  const soldThrough = (i) => {
    const sold = allTime?.byItem[i.id]?.qty || 0;
    return sold + i.left > 0 ? Math.round((sold / (sold + i.left)) * 100) : null;
  };
  const subFor = (e) => {
    const parts = [];
    if (e.group) parts.push(plural(e.children.length, "kind"));
    parts.push(`${e.t.left} left`);
    if (periodKey === "all" && !e.group) {
      const pct = soldThrough(e.item);
      if (pct != null) parts.push(`${pct}% sold`);
    }
    return parts.join(" · ");
  };

  if (!everSold) {
    return (
      <p className="mt-2 text-sm text-ink-muted">
        Nothing has sold yet. Once it does, this shows what&apos;s selling best{whose === "your" ? ", and your profit if you add your costs" : ""}.
      </p>
    );
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Period">
        {periods.map((p) => (
          <button
            key={p.key}
            type="button"
            aria-pressed={p.key === periodKey}
            onClick={() => setPeriodKey(p.key)}
            className={`h-8 rounded-lg border px-3 text-xs font-semibold transition ${
              p.key === periodKey ? "border-ink bg-ink text-paper" : "border-line text-ink-soft hover:border-ink-muted hover:text-ink"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className={`mt-4 grid grid-cols-2 gap-2 ${showCost ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
        <Figure label="Pieces sold" value={total.qty} />
        <Figure label="Sold for" value={money(total.net)} hint="after any discounts" />
        <Figure label={`${Whose} share`} value={money(total.share)} />
        {showCost ? (
          <Figure
            label="Your profit"
            value={total.costed ? money(total.profit) : "—"}
            hint={total.costed ? (missingCost ? "on items with a cost" : "share minus your cost") : "add your costs below"}
          />
        ) : null}
      </div>

      <h3 className="mt-5 text-sm font-semibold text-ink">Best sellers</h3>
      {total.qty ? null : <p className="mt-1 text-sm text-ink-muted">Nothing sold in this period.</p>}
      <ul className="mt-1 divide-y divide-line">
        {entries.map((e) =>
          e.group ? (
            <Line
              key={e.key}
              name={e.name}
              sub={subFor(e)}
              t={e.t}
              max={max}
              showCost={showCost}
              open={!!openGroups[e.key]}
              onToggle={() => setOpenGroups((o) => ({ ...o, [e.key]: !o[e.key] }))}
            >
              {e.children.map((c, idx) => (
                <Line
                  key={c.key}
                  name={c.name}
                  sub={subFor(c)}
                  t={c.t}
                  max={Math.max(1, ...e.children.map((x) => x.t.qty))}
                  showCost={showCost}
                  top={idx === 0 && c.t.qty > 0 && e.children.length > 1}
                />
              ))}
            </Line>
          ) : (
            <Line key={e.key} name={e.name} sub={subFor(e)} t={e.t} max={max} showCost={showCost} />
          )
        )}
      </ul>

      <h3 className="mt-6 text-sm font-semibold text-ink">{Whose} share by month</h3>
      <div className="mt-2 grid h-32 grid-cols-12 items-end gap-1">
        {months.map((m) => (
          <div key={m.ym} className="flex h-full flex-col justify-end" title={`${m.label}: ${money(m.share)} · ${plural(m.qty, "piece")}`}>
            <span className="mb-1 hidden text-center text-[10px] tabular-nums text-ink-muted sm:block">
              {m.share ? `$${Math.round(m.share)}` : ""}
            </span>
            <span className="block w-full bg-verde-deep/80" style={{ height: `${(m.share / monthMax) * 100}%`, minHeight: m.share ? 2 : 0 }} />
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-12 gap-1 border-t border-line pt-1">
        {months.map((m) => (
          <span key={m.ym} className="text-center text-[10px] text-ink-muted">
            {m.label.slice(0, 1)}
            <span className="hidden sm:inline">{m.label.slice(1)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

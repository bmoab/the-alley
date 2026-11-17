"use client";
import { useMemo, useState } from "react";
import Card from "@/components/admin/ui/Card.js";
import PendingButton from "@/components/admin/ui/PendingButton.js";
import { formatMoney } from "@/lib/constants.js";

/**
 * Money → Big picture: an average month from real months, a year at that
 * pace, and "what if" levers. Everything is figured in the browser, so
 * changing a number never touches the books; only "paid personally" is saved.
 */

const IN = [
  { key: "shop", label: "Shop sales", hint: "every register sale, makers' items included" },
  { key: "rentals", label: "Room rentals" },
  { key: "tickets", label: "Event tickets" },
  { key: "rent", label: "Tenants' rent" },
  { key: "staffShares", label: "Tenants' share of staff" },
  { key: "coPayers", label: "Utility shares" },
  { key: "bank", label: "Other income", hint: "from the bank" },
];
const OUT = [
  { key: "makers", label: "Makers' share of sales" },
  { key: "staff", label: "Staff" },
  { key: "mortgage", label: "Mortgage" },
  { key: "utilities", label: "Utilities" },
  { key: "insurance", label: "Insurance" },
  { key: "tax", label: "Property tax" },
  { key: "supplies", label: "Supplies & upkeep" },
  { key: "other", label: "Other bills" },
  { key: "bank", label: "Other spending", hint: "from the bank" },
  { key: "personal", label: "Paid from personal accounts", hint: "not in the business account" },
];

const num = (v) => {
  const n = Number(String(v ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n) => Math.round(n * 100) / 100;
const whole = (n) => formatMoney(Math.round(n)).replace(/\.00$/, "");
const signed = (n) => (n < 0 ? `−${whole(-n)}` : whole(n));
const short = (m) => new Date(`${m}-15T12:00:00`).toLocaleDateString("en-US", { month: "short", year: "2-digit" });

function Stat({ label, value, sub, tone }) {
  return (
    <Card pad="md" className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums sm:text-3xl ${tone === "bad" ? "text-rust" : tone === "good" ? "text-verde-deep" : "text-ink"}`}>{value}</p>
      {sub ? <p className="mt-1 text-xs text-ink-muted">{sub}</p> : null}
    </Card>
  );
}

function Lever({ label, value, onChange, min, max, step, show, hint }) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-ink">{label}</span>
        <span className={`font-semibold tabular-nums ${value ? "text-ink" : "text-ink-muted"}`}>{show(value)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1 w-full accent-[#5d6b45]" />
      {hint ? <span className="block text-xs text-ink-muted">{hint}</span> : null}
    </label>
  );
}

/** Each month's net as a bar from a zero line, then the average. */
function NetChart({ months, avg }) {
  const items = [...months.map((m) => ({ label: short(m.month), net: m.net, off: !m.on })), { label: "Average", net: avg, avg: true }];
  const max = Math.max(1, ...items.map((i) => Math.abs(i.net)));
  const anyUp = items.some((i) => i.net > 0);
  const anyDown = items.some((i) => i.net < 0);
  const H = 160;
  const zero = anyUp && anyDown ? H * (max / (2 * max)) : anyUp ? H : 0;
  const scale = anyUp && anyDown ? H / (2 * max) : H / max;
  return (
    <div>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((i) => {
          const h = Math.abs(i.net) * scale;
          const y = i.net >= 0 ? zero - h : zero;
          return (
            <div key={i.label} className={`flex flex-col items-center ${i.off ? "opacity-35" : ""}`}>
              <span className={`mb-1 text-[11px] font-semibold tabular-nums ${i.net >= 0 ? "text-verde-deep" : "text-rust"}`}>{signed(i.net)}</span>
              <svg viewBox={`0 0 20 ${H}`} className="h-[160px] w-full max-w-[64px]" preserveAspectRatio="none" aria-hidden="true">
                <line x1="0" x2="20" y1={zero} y2={zero} stroke="#c9bfb0" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
                <rect x="3" width="14" y={y} height={Math.max(1, h)} rx="1.5" fill={i.net >= 0 ? "#5d6b45" : i.avg ? "#8f3b22" : "#b5583a"} />
              </svg>
              <span className={`mt-1 text-[11px] ${i.avg ? "font-semibold text-ink" : "text-ink-muted"}`}>{i.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function BigPicture({ rows, n, saveAction }) {
  const hasData = (r) => IN.some((l) => r.income[l.key]) || OUT.some((l) => l.key !== "personal" && r.costs[l.key]);
  const [on, setOn] = useState(() => new Set(rows.filter(hasData).map((r) => r.month)));
  const [personal, setPersonal] = useState(() => Object.fromEntries(rows.map((r) => [r.month, r.personal ? String(r.personal) : ""])));
  const [notes, setNotes] = useState(() => Object.fromEntries(rows.map((r) => [r.month, r.personalNote || ""])));
  const [edits, setEdits] = useState({});
  const [lv, setLv] = useState({ rentals: 0, rent: 0, shopPct: 0, staffPct: 0, cut: 0 });
  const dirty = rows.some((r) => num(personal[r.month]) !== (r.personal || 0) || (notes[r.month] || "") !== (r.personalNote || ""));

  const months = useMemo(
    () =>
      rows.map((r) => {
        const inn = r2(IN.reduce((s, l) => s + (r.income[l.key] || 0), 0));
        const outBiz = r2(OUT.reduce((s, l) => s + (l.key === "personal" ? 0 : r.costs[l.key] || 0), 0));
        const pers = num(personal[r.month]);
        return { ...r, on: on.has(r.month), inn, outBiz, pers, out: r2(outBiz + pers), net: r2(inn - outBiz - pers) };
      }),
    [rows, personal, on]
  );
  const used = months.filter((m) => m.on);
  const avgOf = (side, key) => {
    if (!used.length) return 0;
    const v = used.reduce((s, m) => s + (key === "personal" ? m.pers : side === "in" ? m.income[key] || 0 : m.costs[key] || 0), 0);
    return r2(v / used.length);
  };
  const lineVal = (side, key) => {
    const e = edits[`${side}.${key}`];
    return e != null && e !== "" ? num(e) : avgOf(side, key);
  };
  const base = {
    inn: r2(IN.reduce((s, l) => s + lineVal("in", l.key), 0)),
    out: r2(OUT.reduce((s, l) => s + lineVal("out", l.key), 0)),
  };
  base.net = r2(base.inn - base.out);

  // What if: the levers on top of the average month.
  const shopF = 1 + lv.shopPct / 100;
  const staffF = 1 + lv.staffPct / 100;
  const adjIn =
    base.inn +
    lineVal("in", "shop") * (shopF - 1) +
    lineVal("in", "staffShares") * (staffF - 1) +
    lv.rentals +
    lv.rent;
  const adjOut = base.out + lineVal("out", "makers") * (shopF - 1) + lineVal("out", "staff") * (staffF - 1) - lv.cut;
  const adjNet = r2(adjIn - adjOut);
  const touched = Object.values(lv).some(Boolean);

  const toggle = (m) =>
    setOn((prev) => {
      const next = new Set(prev);
      next.has(m) ? next.delete(m) : next.add(m);
      return next;
    });

  // A plain function, not a component, so typing doesn't remount the input.
  const avgLine = (side, l) => {
    const k = `${side}.${l.key}`;
    const avg = avgOf(side, l.key);
    const edited = edits[k] != null && edits[k] !== "";
    return (
      <li key={l.key} className="flex items-center justify-between gap-3 py-1.5">
        <span className="min-w-0 text-sm">
          <span className="text-ink">{l.label}</span>
          {l.hint ? <span className="ml-1.5 text-xs text-ink-muted">{l.hint}</span> : null}
          {edited ? (
            <button type="button" onClick={() => setEdits((e) => ({ ...e, [k]: "" }))} className="ml-2 text-xs text-ink-muted underline">
              back to {whole(avg)}
            </button>
          ) : null}
        </span>
        <input
          inputMode="decimal"
          aria-label={`${l.label} in an average month`}
          value={edited ? edits[k] : avg ? String(Math.round(avg)) : ""}
          placeholder="0"
          onChange={(e) => setEdits((x) => ({ ...x, [k]: e.target.value }))}
          className={`field !h-8 !w-28 shrink-0 !py-0 text-right tabular-nums ${edited ? "!border-ink" : ""}`}
        />
      </li>
    );
  };

  if (!rows.length) return null;

  return (
    <div className="space-y-6">
      {/* The headline */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Average month in" value={whole(base.inn)} />
        <Stat label="Average month out" value={whole(base.out)} sub={lineVal("out", "personal") ? `includes ${whole(lineVal("out", "personal"))} paid personally` : "business account only so far"} />
        <Stat label={base.net >= 0 ? "Left over a month" : "Short a month"} value={whole(Math.abs(base.net))} tone={base.net >= 0 ? "good" : "bad"} sub={`about ${whole(Math.abs(base.net) / 30.4)} a day`} />
        <Stat label={base.net >= 0 ? "Over a year" : "Short over a year"} value={whole(Math.abs(base.net * 12))} tone={base.net >= 0 ? "good" : "bad"} sub="at this pace" />
      </div>

      <Card pad="md">
        <h2 className="text-base font-semibold text-ink">Month by month</h2>
        <p className="mt-1 text-sm text-ink-muted">
          What was left over or short each month. Untick a month to leave it out of the average. Add what was paid from personal accounts and press Save so it&apos;s here next time.
        </p>
        <div className="mt-4">
          <NetChart months={months} avg={base.net} />
        </div>
        <form action={saveAction} className="mt-5">
          <input type="hidden" name="months" value={rows.map((r) => r.month).join(",")} />
          <input type="hidden" name="n" value={n} />
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-ink-muted">
                  <th className="py-2 font-semibold">Month</th>
                  <th className="py-2 text-right font-semibold">In</th>
                  <th className="py-2 text-right font-semibold">Out<span className="hidden sm:inline"> (business account)</span></th>
                  <th className="py-2 pl-2 font-semibold sm:pl-3">Paid personally</th>
                  <th className="py-2 text-right font-semibold">Left over</th>
                </tr>
              </thead>
              <tbody>
                {months.map((m) => (
                  <tr key={m.month} className={`border-t border-line align-top ${m.on ? "" : "text-ink-muted"}`}>
                    <td className="py-2">
                      <label className="flex items-start gap-2">
                        <input type="checkbox" checked={m.on} onChange={() => toggle(m.month)} className="mt-1" />
                        <span>
                          <span className="font-semibold">{m.label}</span>
                          {m.fromSquare ? <span className="block text-xs text-ink-muted">sales read from Square</span> : null}
                          {m.staffFromBank ? <span className="block text-xs text-ink-muted">staff from the bank</span> : null}
                          {!hasData(m) ? <span className="block text-xs text-ink-muted">nothing in yet</span> : null}
                        </span>
                      </label>
                    </td>
                    <td className="py-2 text-right tabular-nums">{whole(m.inn)}</td>
                    <td className="py-2 text-right tabular-nums">{whole(m.outBiz)}</td>
                    <td className="py-2 pl-2 sm:pl-3">
                      <input
                        name={`personal_${m.month}`}
                        inputMode="decimal"
                        placeholder="0"
                        value={personal[m.month]}
                        onChange={(e) => setPersonal((p) => ({ ...p, [m.month]: e.target.value }))}
                        className="field !h-8 !w-20 !py-0 text-right tabular-nums sm:!w-28"
                        aria-label={`Paid personally in ${m.label}`}
                      />
                      <input
                        name={`note_${m.month}`}
                        placeholder="what for (optional)"
                        value={notes[m.month]}
                        onChange={(e) => setNotes((p) => ({ ...p, [m.month]: e.target.value }))}
                        className="field mt-1 !h-8 !w-20 !py-0 text-xs sm:!w-full"
                        aria-label={`What was paid personally in ${m.label}`}
                      />
                    </td>
                    <td className={`py-2 text-right font-semibold tabular-nums ${m.net >= 0 ? "text-verde-deep" : "text-rust"}`}>{signed(m.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <PendingButton label="Save paid personally" size="sm" variant={dirty ? "primary" : "ghost"} />
            {dirty ? <span className="text-xs text-rust">Not saved yet</span> : null}
          </div>
        </form>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card pad="md">
          <h2 className="text-base font-semibold text-ink">An average month</h2>
          <p className="mt-1 text-sm text-ink-muted">
            The average of the ticked months. Type over any number to try it — say, what a bill really runs — and everything else follows.
          </p>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-verde-deep">Money in · {whole(base.inn)}</p>
          <ul className="divide-y divide-line">{IN.map((l) => avgLine("in", l))}</ul>
          <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-ink-soft">Money out · {whole(base.out)}</p>
          <ul className="divide-y divide-line">{OUT.map((l) => avgLine("out", l))}</ul>
          {Object.values(edits).some((v) => v !== "" && v != null) ? (
            <button type="button" onClick={() => setEdits({})} className="mt-3 text-xs text-ink-muted underline">
              Put every number back to the average
            </button>
          ) : null}
        </Card>

        <div className="space-y-6">
          <Card pad="md">
            <h2 className="text-base font-semibold text-ink">What would change it</h2>
            <p className="mt-1 text-sm text-ink-muted">Slide these to see what it would take.</p>
            <div className="mt-4 space-y-4">
              <Lever label="More room rentals a month" value={lv.rentals} min={0} max={6000} step={50} show={(v) => `+${whole(v)}`} onChange={(v) => setLv((x) => ({ ...x, rentals: v }))} />
              <Lever label="More rent a month" value={lv.rent} min={0} max={6000} step={50} show={(v) => `+${whole(v)}`} hint="a new tenant, or a rent increase" onChange={(v) => setLv((x) => ({ ...x, rent: v }))} />
              <Lever label="Shop sales" value={lv.shopPct} min={-100} max={300} step={5} show={(v) => (v > 0 ? `+${v}%` : `${v}%`)} hint="the makers' share moves with it" onChange={(v) => setLv((x) => ({ ...x, shopPct: v }))} />
              <Lever label="Staff hours" value={lv.staffPct} min={-100} max={100} step={5} show={(v) => (v > 0 ? `+${v}%` : `${v}%`)} hint="tenants' share of staff moves with it" onChange={(v) => setLv((x) => ({ ...x, staffPct: v }))} />
              <Lever label="Cut spending a month" value={lv.cut} min={0} max={Math.max(1000, Math.ceil(base.out / 100) * 100)} step={50} show={(v) => `−${whole(v)}`} onChange={(v) => setLv((x) => ({ ...x, cut: v }))} />
            </div>
            {touched ? (
              <button type="button" onClick={() => setLv({ rentals: 0, rent: 0, shopPct: 0, staffPct: 0, cut: 0 })} className="mt-3 text-xs text-ink-muted underline">
                Reset
              </button>
            ) : null}
          </Card>

          <Card pad="md" className={adjNet >= 0 ? "border-verde-deep/40 bg-verde/30" : "border-rust/30 bg-rust/5"}>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{touched ? "With those changes" : "Right now"}</p>
            <p className={`mt-1 text-3xl font-semibold tabular-nums ${adjNet >= 0 ? "text-verde-deep" : "text-rust"}`}>
              {adjNet >= 0 ? "+" : "−"}
              {whole(Math.abs(adjNet))} <span className="text-base font-normal text-ink-soft">a month</span>
            </p>
            <p className="mt-1 text-sm text-ink-soft">
              {adjNet >= 0 ? "Left over" : "Short"} <strong className="tabular-nums">{whole(Math.abs(adjNet * 12))}</strong> over a year.
            </p>
            <p className="mt-3 text-sm text-ink">
              {adjNet >= 0
                ? touched && base.net < 0
                  ? `That's enough to break even, with ${whole(adjNet)} a month to spare.`
                  : "It pays for itself."
                : `To break even it needs ${whole(-adjNet)} more coming in (or going out less) every month.`}
            </p>
            {touched ? (
              <p className="mt-1 text-xs text-ink-muted">
                Change from the average: {adjNet - base.net >= 0 ? "+" : "−"}
                {whole(Math.abs(adjNet - base.net))} a month · {adjNet - base.net >= 0 ? "+" : "−"}
                {whole(Math.abs((adjNet - base.net) * 12))} a year
              </p>
            ) : null}
          </Card>
        </div>
      </div>

      <p className="text-xs text-ink-muted">
        From the Money page&apos;s numbers: register sales and rentals from Square, rent ticked on Money, bills, staff cost, and bank lines sorted to
        supplies, other spending or other income. Sales tax and refundable deposits aren&apos;t counted — they aren&apos;t The Alley&apos;s.
      </p>
    </div>
  );
}

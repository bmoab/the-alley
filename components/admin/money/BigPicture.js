"use client";
import { useMemo, useState } from "react";
import Card from "@/components/admin/ui/Card.js";
import PendingButton from "@/components/admin/ui/PendingButton.js";
import { formatMoney } from "@/lib/constants.js";

/**
 * Money → Big picture: an average month from real months, a year at that
 * pace, and "what if" levers. Everything is figured in the browser, so
 * changing a number never touches the books; only "paid personally" is saved.
 *
 * "Paid personally" is either the amounts typed in per month, or — with the
 * account slider below 100% — an estimate: if the Alley account carries only
 * part of the spending, the rest is what it paid out times (rest ÷ part).
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

const IN_COLOR = "#5d6b45";
const OUT_COLOR = "#c4ad8f";

/** Each month's money in and out side by side, what was left (or short) on top, then the average. */
function MonthsChart({ months, avg }) {
  const items = [
    ...months.map((m) => ({ label: short(m.month), inn: m.inn, out: m.out, net: m.net, off: !m.on })),
    { label: "Average", inn: avg.inn, out: avg.out, net: avg.net, avg: true },
  ];
  const max = Math.max(1, ...items.flatMap((i) => [i.inn, i.out]));
  const H = 120;
  const bar = (v) => Math.max(1, (Math.max(0, v) / max) * H);
  return (
    <div className="print-color">
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((i) => (
          <div key={i.label} className={`flex min-w-0 flex-col items-center ${i.off ? "opacity-35" : ""}`}>
            <span className={`mb-1 whitespace-nowrap text-[11px] font-semibold tabular-nums ${i.net >= 0 ? "text-verde-deep" : "text-rust"}`}>{signed(i.net)}</span>
            <svg viewBox={`0 0 30 ${H}`} className="h-[120px] w-full max-w-[56px]" preserveAspectRatio="none" aria-label={`${i.label}: ${whole(i.inn)} in, ${whole(i.out)} out`}>
              <rect x="2" width="12" y={H - bar(i.inn)} height={bar(i.inn)} rx="1.5" fill={IN_COLOR} />
              <rect x="16" width="12" y={H - bar(i.out)} height={bar(i.out)} rx="1.5" fill={OUT_COLOR} />
            </svg>
            <span className={`mt-1 border-t border-line pt-1 text-center text-[11px] ${i.avg ? "font-semibold text-ink" : "text-ink-muted"}`}>{i.label}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: IN_COLOR }} /> In
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: OUT_COLOR }} /> Out
        </span>
        <span>Number on top: left over or short</span>
      </p>
    </div>
  );
}

/** One side of an average month, biggest first, as bars with each line's share. */
function Breakdown({ title, lines, total, color }) {
  const shown = lines.filter((l) => l.value > 0.5).sort((a, b) => b.value - a.value);
  const top = shown[0]?.value || 1;
  return (
    <div className="print-color">
      <p className="flex items-baseline justify-between gap-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">
        <span>{title}</span>
        <span className="tabular-nums text-ink">{whole(total)}</span>
      </p>
      {shown.length ? (
        <ul className="mt-2 space-y-2">
          {shown.map((l) => (
            <li key={l.key} className="text-sm">
              <span className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 text-ink">{l.label}</span>
                <span className="shrink-0 tabular-nums text-ink">
                  {whole(l.value)} <span className="inline-block w-9 text-right text-xs text-ink-muted">{total > 0 ? Math.round((l.value / total) * 100) : 0}%</span>
                </span>
              </span>
              <span className="mt-1 block h-1.5 rounded-full bg-paper-dim">
                <span className="block h-1.5 rounded-full" style={{ width: `${Math.max(2, (l.value / top) * 100)}%`, background: color }} />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-ink-muted">Nothing yet.</p>
      )}
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
  // How much of the Alley's spending goes through the Alley account (100 = all of it).
  const [thru, setThru] = useState(100);
  const sliderOn = thru < 100;
  const ratio = (100 - thru) / thru;
  const dirty = rows.some((r) => num(personal[r.month]) !== (r.personal || 0) || (notes[r.month] || "") !== (r.personalNote || ""));

  // A month with no bank statement yet borrows the average of the ticked months that have one.
  const withBank = rows.filter((r) => r.hasBank && on.has(r.month));
  const bankAvg = withBank.length ? r2(withBank.reduce((s, r) => s + r.accountOut, 0) / withBank.length) : 0;
  const months = useMemo(
    () =>
      rows.map((r) => {
        const inn = r2(IN.reduce((s, l) => s + (r.income[l.key] || 0), 0));
        const outBiz = r2(OUT.reduce((s, l) => s + (l.key === "personal" ? 0 : r.costs[l.key] || 0), 0));
        const est = r2((r.hasBank ? r.accountOut : bankAvg) * ratio);
        const pers = sliderOn ? est : num(personal[r.month]);
        return { ...r, on: on.has(r.month), inn, outBiz, est, pers, out: r2(outBiz + pers), net: r2(inn - outBiz - pers) };
      }),
    [rows, personal, on, sliderOn, ratio, bankAvg]
  );
  const used = months.filter((m) => m.on);
  const noBank = used.filter((m) => !m.hasBank);
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
    const hint = l.key === "personal" && sliderOn ? `estimate: ${100 - thru}% of spending` : l.hint;
    return (
      <li key={l.key} className="flex items-center justify-between gap-3 py-1.5">
        <span className="min-w-0 text-sm">
          <span className="text-ink">{l.label}</span>
          {hint ? <span className="ml-1.5 text-xs text-ink-muted">{hint}</span> : null}
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

  const inLines = IN.map((l) => ({ ...l, value: lineVal("in", l.key) }));
  const outLines = OUT.map((l) => ({ ...l, label: l.key === "personal" ? "Paid personally" : l.label, value: lineVal("out", l.key) }));
  // How much of the building's fixed costs the tenants' rent covers.
  const fixed = ["mortgage", "utilities", "insurance", "tax"].reduce((s, k) => s + lineVal("out", k), 0);
  const rentCovers = fixed > 0 && lineVal("in", "rent") > 0 ? Math.round((lineVal("in", "rent") / fixed) * 100) : null;
  const usedLabels = used.map((m) => short(m.month));

  return (
    <div className="space-y-5" data-print>
      {/* Only on paper: what this printout is. */}
      <p className="hidden text-sm text-ink-soft print:block">
        Printed {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} · average of{" "}
        {usedLabels.length ? usedLabels.join(", ") : "no months"}
        {sliderOn ? ` · assumes ${thru}% of the Alley's spending goes through the Alley account` : ""}
        {Object.values(edits).some((v) => v !== "" && v != null) ? " · some average-month numbers typed over" : ""}
      </p>

      {/* The headline */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 print:grid-cols-4">
        <Stat label="Average month in" value={whole(base.inn)} />
        <Stat label="Average month out" value={whole(base.out)} sub={lineVal("out", "personal") ? `includes ${whole(lineVal("out", "personal"))} paid personally${sliderOn ? " (estimate)" : ""}` : "nothing paid personally added yet"} />
        <Stat label={base.net >= 0 ? "Left over a month" : "Short a month"} value={whole(Math.abs(base.net))} tone={base.net >= 0 ? "good" : "bad"} sub={`about ${whole(Math.abs(base.net) / 30.4)} a day`} />
        <Stat label={base.net >= 0 ? "Over a year" : "Short over a year"} value={whole(Math.abs(base.net * 12))} tone={base.net >= 0 ? "good" : "bad"} sub="at this pace" />
      </div>

      <div className="grid gap-5 xl:grid-cols-5 print:grid-cols-1">
        <Card pad="md" className="min-w-0 xl:col-span-2 print:col-span-1">
          <h2 className="text-base font-semibold text-ink">Each month</h2>
          <p className="mt-1 text-sm text-ink-muted print:hidden">Faded months are left out of the average.</p>
          <div className="mt-4">
            <MonthsChart months={months} avg={base} />
          </div>
        </Card>
        <Card pad="md" className="min-w-0 xl:col-span-3 print:col-span-1">
          <h2 className="text-base font-semibold text-ink">Where it comes from, where it goes</h2>
          <p className="mt-1 text-sm text-ink-muted">An average month, biggest first.</p>
          <div className="mt-4 grid gap-6 sm:grid-cols-2 print:grid-cols-2">
            <Breakdown title="Money in" lines={inLines} total={base.inn} color={IN_COLOR} />
            <Breakdown title="Money out" lines={outLines} total={base.out} color={OUT_COLOR} />
          </div>
          {rentCovers != null ? (
            <p className="mt-4 border-t border-line pt-3 text-sm text-ink">
              Tenants&apos; rent covers <strong className="tabular-nums">{rentCovers}%</strong> of the building&apos;s fixed costs{" "}
              <span className="text-ink-muted">(mortgage, utilities, insurance and property tax, {whole(fixed)} a month)</span>.
            </p>
          ) : null}
        </Card>
      </div>

      <Card pad="md" className="print:hidden">
        <h2 className="text-base font-semibold text-ink">Paid from personal accounts</h2>
        <p className="mt-1 text-sm text-ink-muted">
          The Money page only sees the Alley account. If some of the Alley&apos;s spending is paid personally, slide this to how much goes through the
          Alley account, and the rest is added as paid personally. At 100%, the amounts typed in under Month by month are used instead.
        </p>
        <div className="mt-4 max-w-xl">
          <Lever
            label="Share of the Alley's spending paid from the Alley account"
            value={thru}
            min={5}
            max={100}
            step={5}
            show={(v) => `${v}%`}
            onChange={setThru}
          />
        </div>
        {sliderOn ? (
          <div className="mt-3 space-y-1 text-sm">
            <p className="text-ink">
              {bankAvg ? (
                <>
                  The Alley account paid out about <strong className="tabular-nums">{whole(bankAvg)}</strong> a month. If that&apos;s {thru}% of the
                  spending, about <strong className="tabular-nums text-rust">{whole(bankAvg * ratio)}</strong> a month ({whole(bankAvg * ratio * 12)} a
                  year) was paid personally.
                </>
              ) : (
                "Upload a bank statement for at least one of these months (Money → Bank) to estimate from."
              )}
            </p>
            <p className="text-xs text-ink-muted">
              Counts everything that left the account except transfers to the owner and sales tax. If something paid personally is already on the Money
              page — a bill typed into Bills, say — it&apos;s now counted twice, so ease the slider up a little.
              {noBank.length && bankAvg
                ? ` No bank statement yet for ${noBank.map((m) => m.label).join(", ")}, so ${noBank.length === 1 ? "it uses" : "they use"} the average of the months that have one.`
                : ""}
            </p>
          </div>
        ) : null}
      </Card>

      <Card pad="md">
        <h2 className="text-base font-semibold text-ink">Month by month</h2>
        <p className="mt-1 text-sm text-ink-muted print:hidden">
          Untick a month to leave it out of the average. Add what was paid from personal accounts and press Save so it&apos;s here next time.
        </p>
        <form action={saveAction} className="mt-4">
          <input type="hidden" name="months" value={rows.map((r) => r.month).join(",")} />
          <input type="hidden" name="n" value={n} />
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-ink-muted">
                  <th className="py-2 font-semibold">Month</th>
                  <th className="py-2 text-right font-semibold">In</th>
                  <th className="py-2 text-right font-semibold">Out<span className="hidden sm:inline"> (on Money)</span></th>
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
                          {!m.on ? <span className="hidden text-xs text-ink-muted print:block">left out of the average</span> : null}
                        </span>
                      </label>
                    </td>
                    <td className="py-2 text-right tabular-nums">{whole(m.inn)}</td>
                    <td className="py-2 text-right tabular-nums">{whole(m.outBiz)}</td>
                    <td className="py-2 pl-2 sm:pl-3">
                      {sliderOn ? (
                        <span className="mb-1 block text-xs font-semibold tabular-nums text-ink">
                          {m.hasBank ? `${whole(m.est)} estimated` : bankAvg ? `${whole(m.est)} avg.` : "no bank statement"}
                        </span>
                      ) : null}
                      {!sliderOn ? (
                        <span className="hidden tabular-nums print:block">
                          {num(personal[m.month]) ? whole(num(personal[m.month])) : "—"}
                          {notes[m.month] ? <span className="block text-xs text-ink-muted">{notes[m.month]}</span> : null}
                        </span>
                      ) : null}
                      <div className={`print:hidden ${sliderOn ? "opacity-40" : ""}`}>
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
                      </div>
                    </td>
                    <td className={`py-2 text-right font-semibold tabular-nums ${m.net >= 0 ? "text-verde-deep" : "text-rust"}`}>{signed(m.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center gap-3 print:hidden">
            <PendingButton label="Save paid personally" size="sm" variant={dirty ? "primary" : "ghost"} />
            {dirty ? <span className="text-xs text-rust">Not saved yet</span> : null}
          </div>
        </form>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2 print:grid-cols-1">
        {/* On paper, "Where it comes from" already shows the average month. */}
        <Card pad="md" className="print:hidden">
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

        <div className={`space-y-5 ${touched ? "" : "print:hidden"}`}>
          <Card pad="md">
            <h2 className="text-base font-semibold text-ink">What would change it</h2>
            <p className="mt-1 text-sm text-ink-muted print:hidden">Slide these to see what it would take.</p>
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

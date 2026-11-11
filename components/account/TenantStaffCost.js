import { ChevronDown, Users } from "lucide-react";
import { formatMoney, shiftDate } from "@/lib/constants.js";

/**
 * A tenant's share of the shop staff, on their account: this month so far and
 * an estimate for the whole month, who worked (first names and hours — never
 * pay), and each past month with what it came to, plus the year's totals.
 * Takes tenantStaffCost()'s shape; the account tour passes a sample.
 */

const shortDay = (ymd) => new Date(`${ymd}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** "Nov 1–7", or "Oct 25–Nov 1" across months. */
function weekLabel(start) {
  const end = shiftDate(start, { days: 6 });
  return start.slice(0, 7) === end.slice(0, 7) ? `${shortDay(start)}–${Number(end.slice(8))}` : `${shortDay(start)}–${shortDay(end)}`;
}

const hrs = (n) => (Math.round(n * 10) / 10).toLocaleString("en-US");

function HoursTable({ weeks, people }) {
  if (!people.length) return <p className="ac-small" style={{ margin: "10px 0 0" }}>No hours clocked yet.</p>;
  const total = (wk) => people.reduce((t, p) => t + (p.weeks[wk] || 0), 0);
  return (
    <div className="ac-hours">
      <table>
        <thead>
          <tr>
            <th>Who</th>
            {weeks.map((wk) => (
              <th key={wk} className="num">{weekLabel(wk)}</th>
            ))}
            <th className="num">Hours</th>
          </tr>
        </thead>
        <tbody>
          {people.map((p) => (
            <tr key={p.name}>
              <td>{p.name}</td>
              {weeks.map((wk) => (
                <td key={wk} className="num">{p.weeks[wk] ? hrs(p.weeks[wk]) : "—"}</td>
              ))}
              <td className="num strong">{hrs(p.hours)}</td>
            </tr>
          ))}
          <tr className="sum">
            <td>Everyone</td>
            {weeks.map((wk) => (
              <td key={wk} className="num">{hrs(total(wk))}</td>
            ))}
            <td className="num strong">{hrs(people.reduce((t, p) => t + p.hours, 0))}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

const STATUS = {
  paid: (h) => <span className="ac-pill ac-pill--live">{h.paidMethod ? `Paid · ${h.paidMethod}` : "Paid"}</span>,
  due: () => <span className="ac-pill ac-pill--wait">Due</span>,
  coming: () => <span className="ac-pill">Bill coming</span>,
};

export default function TenantStaffCostCard({ data, name, wide = true }) {
  if (!data || (!data.current && !data.history.length)) return null;
  const { current: c, history } = data;
  const month = c ? c.label.split(" ")[0] : "";
  const paydays = c?.paychecks?.map((p) => shortDay(p.payday)) || [];

  return (
    <div className={`ac-tile ac-rise ${wide ? "ac-tile--wide" : ""}`} data-jump={`Staff cost${name ? ` · ${name}` : ""}`}>
      <div className="ac-tile-head">
        <span className="ac-icon">
          <Users aria-hidden="true" />
        </span>
        <div style={{ minWidth: 0 }}>
          <p className="ac-eyebrow">Shared staff cost{name ? ` · ${name}` : ""}</p>
          <h2 className="ac-tile-title">
            {c?.estimate != null ? `About ${formatMoney(c.estimate)} for ${month}` : c ? `${formatMoney(c.soFar)} for ${month} so far` : "Your staff cost"}
          </h2>
        </div>
      </div>

      <div className="ac-figures">
        {c ? (
          <div className="ac-figure">
            <b>{formatMoney(c.soFar)}</b>
            <span>{month} so far</span>
          </div>
        ) : null}
        {c?.estimate != null ? (
          <div className="ac-figure">
            <b>~{formatMoney(c.estimate)}</b>
            <span>Estimate</span>
          </div>
        ) : null}
        {history[0] ? (
          <div className="ac-figure">
            <b>{formatMoney(history[0].amount)}</b>
            <span>{history[0].label.split(" ")[0]}</span>
          </div>
        ) : null}
      </div>

      {c ? (
        <p className="ac-tile-body" style={{ fontSize: 14 }}>
          Your share of the shop staff, split evenly {c.parties} ways between the tenants and the shop. It counts the
          payroll paid in {month}
          {paydays.length ? ` (payday${paydays.length > 1 ? "s" : ""} ${paydays.join(", ").replace(/, ([^,]*)$/, " and $1")})` : ""}
          , with payroll taxes and fees.
          {c.estimate != null && c.daysLeft
            ? ` "So far" is the hours clocked to date; the estimate adds the last four weeks' pace for the ${c.daysLeft} work day${c.daysLeft === 1 ? "" : "s"} still to come.`
            : ""}{" "}
          We bill it once {month} is over.
        </p>
      ) : null}

      {c ? (
        <details className="ac-stc" open>
          <summary>
            <span>
              Who worked for {month}&apos;s paychecks · <strong>{hrs(c.hours)} hours</strong>
            </span>
            <ChevronDown className="ac-stc-chev" width={16} height={16} aria-hidden="true" />
          </summary>
          <HoursTable weeks={c.weeks} people={c.people} />
        </details>
      ) : null}

      {history.length ? (
        <div>
          <p className="ac-eyebrow" style={{ margin: "4px 0 6px" }}>Past months</p>
          <ul className="ac-rows">
            {history.map((h) => (
              <li key={h.month}>
                <details className="ac-stc">
                  <summary>
                    <span className="ac-row-main">
                      <span className="ac-row-title">{h.label}</span>
                      <span className="ac-row-sub">
                        {formatMoney(h.amount)} · {hrs(h.hours)} staff hours
                      </span>
                    </span>
                    {STATUS[h.status](h)}
                    <ChevronDown className="ac-stc-chev" width={16} height={16} aria-hidden="true" />
                  </summary>
                  <HoursTable weeks={h.weeks} people={h.people} />
                </details>
              </li>
            ))}
          </ul>
          {data.billedThisYear ? (
            <p className="ac-small" style={{ margin: "8px 0 0" }}>
              In {data.year}: {formatMoney(data.billedThisYear)} billed, {formatMoney(data.paidThisYear)} paid.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

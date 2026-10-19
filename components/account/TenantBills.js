import { Receipt } from "lucide-react";
import { tenantBills } from "@/lib/staff-costs.js";
import { venueDayOf, formatDateShort, formatMoney } from "@/lib/constants.js";

/**
 * A tenant's bills with The Alley, in one card: monthly rent (with its pay
 * link, when the owner has set one) and their share of the staff cost — the
 * unpaid ones with a Pay button, then the last few paid. Nothing at all when
 * there's nothing to show.
 */
export default function TenantBills({ directoryId, name, wide = true }) {
  return <TenantBillsCard bills={tenantBills(directoryId)} name={name} wide={wide} />;
}

/** The card itself, from tenantBills()'s shape — the account tour passes sample bills. */
export function TenantBillsCard({ bills: b, name, wide = true }) {
  if (!b || (!b.rent && !b.unpaid.length && !b.paid.length)) return null;
  const due = b.unpaid.reduce((t, r) => t + Number(r.amount || 0), 0);
  return (
    <div className={`ac-tile ac-rise ${wide ? "ac-tile--wide" : ""}`}>
      <div className="ac-tile-head">
        <span className="ac-icon">
          <Receipt aria-hidden="true" />
        </span>
        <div style={{ minWidth: 0 }}>
          <p className="ac-eyebrow">Bills{name ? ` · ${name}` : ""}</p>
          <h2 className="ac-tile-title">{due ? `${formatMoney(due)} due` : "You're all paid up"}</h2>
        </div>
      </div>
      <ul className="ac-rows">
        {b.rent ? (
          <li>
            <div className="ac-row">
              <span className="ac-row-main">
                <span className="ac-row-title" style={{ whiteSpace: "normal" }}>Monthly rent</span>
                <span className="ac-row-sub">
                  {b.rent.amount ? `${formatMoney(b.rent.amount)} · ` : ""}due on the 1st
                </span>
              </span>
              {b.rent.link ? (
                <a href={b.rent.link} target="_blank" rel="noreferrer" className="ac-btn ac-btn--auto" style={{ height: 40, padding: "0 18px", fontSize: 11 }}>
                  Pay rent <span className="ac-arrow" aria-hidden="true">→</span>
                </a>
              ) : null}
            </div>
          </li>
        ) : null}
        {b.unpaid.map((r) => (
          <li key={r.id}>
            <div className="ac-row">
              <span className="ac-row-main">
                <span className="ac-row-title" style={{ whiteSpace: "normal" }}>{r.label}</span>
                <span className="ac-row-sub">
                  {formatMoney(r.amount)}
                  {r.sent_at ? ` · sent ${formatDateShort(venueDayOf(r.sent_at))}` : ""}
                </span>
              </span>
              {r.payment_link ? (
                <a href={r.payment_link} target="_blank" rel="noreferrer" className="ac-btn ac-btn--auto" style={{ height: 40, padding: "0 18px", fontSize: 11 }}>
                  Pay <span className="ac-arrow" aria-hidden="true">→</span>
                </a>
              ) : (
                <span className="ac-pill ac-pill--wait">Due</span>
              )}
            </div>
          </li>
        ))}
        {b.paid.map((r) => (
          <li key={r.id}>
            <div className="ac-row">
              <span className="ac-row-main">
                <span className="ac-row-title" style={{ fontWeight: 400 }}>{r.label}</span>
                <span className="ac-row-sub">{formatMoney(r.amount)}</span>
              </span>
              <span className="ac-pill ac-pill--live">Paid</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

import Link from "next/link";
import {
  Banknote,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CreditCard,
  FileSignature,
  Mail,
  Megaphone,
  Package,
  Search,
  Tag,
  UserRound,
} from "lucide-react";
import { PERIODS, filterQuery } from "@/lib/activity-feed.js";
import { formatMoney } from "@/lib/constants.js";

const ICON = {
  booking: CalendarDays,
  payment: CreditCard,
  sale: Tag,
  payout: Banknote,
  stock: Package,
  listing: Megaphone,
  terms: FileSignature,
  email: Mail,
  account: UserRound,
};

const PAGE = 60;

function stamp(at) {
  const [d, t] = String(at).split(" ");
  const [y, m, day] = d.split("-").map(Number);
  const date = new Date(y, m - 1, day).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  if (!t) return date;
  const [h, min] = t.split(":").map(Number);
  return `${date} · ${h % 12 || 12}:${String(min).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

function monthOf(at) {
  const [y, m] = String(at).split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

const external = (href) => /^https?:/i.test(href);

function Head({ r, open }) {
  const Icon = ICON[r.type] || UserRound;
  return (
    <>
      <span className={`ac-act-icon ac-act-icon--${r.type}`} aria-hidden="true">
        <Icon />
      </span>
      <span className="ac-row-main">
        <span className="ac-act-title">{r.title}</span>
        <span className="ac-row-sub">
          {stamp(r.at)}
          {r.sub ? ` · ${r.sub}` : ""}
        </span>
      </span>
      {r.amount != null ? (
        <span className={`ac-act-amt ${r.flow === "in" ? "is-in" : ""}`}>
          {r.flow === "in" ? "+" : ""}
          {formatMoney(r.amount)}
        </span>
      ) : null}
      {open === "fold" ? (
        <ChevronDown className="ac-act-chev" width={18} height={18} aria-hidden="true" />
      ) : open === "link" ? (
        <ChevronRight className="ac-row-chev" width={18} height={18} aria-hidden="true" />
      ) : (
        <span className="ac-act-chev-space" aria-hidden="true" />
      )}
    </>
  );
}

function Body({ r }) {
  return (
    <div className="ac-act-body">
      {r.details?.length ? (
        <dl className="ac-act-dl">
          {r.details.map(([k, v], i) =>
            k ? (
              <div key={i}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ) : (
              <div key={i} className="is-note">
                <dd>{v}</dd>
              </div>
            )
          )}
        </dl>
      ) : null}
      {r.lines?.length ? (
        <ul className="ac-act-lines">
          {r.lines.map((l, i) => (
            <li key={i}>
              <span>{l.name}</span>
              <span>
                {l.qty} × {formatMoney(l.each ? l.amount : l.amount / (l.qty || 1))}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {r.links?.length ? (
        <div className="ac-act-links">
          {r.links.map((l) =>
            external(l.href) ? (
              <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className="ac-act-btn">
                {l.label} <span aria-hidden="true">↗</span>
              </a>
            ) : (
              <Link key={l.href} href={l.href} className="ac-act-btn">
                {l.label} <span aria-hidden="true">→</span>
              </Link>
            )
          )}
        </div>
      ) : null}
    </div>
  );
}

function Row({ r, emailHref }) {
  const href = r.emailId != null ? emailHref(r.emailId) : r.href;
  const folds = !href && (r.details?.length || r.lines?.length || r.links?.length);
  return (
    <li className="ac-act-item">
      {href ? (
        <Link href={href} className="ac-act-head">
          <Head r={r} open="link" />
        </Link>
      ) : folds ? (
        <details>
          <summary className="ac-act-head">
            <Head r={r} open="fold" />
          </summary>
          <Body r={r} />
        </details>
      ) : (
        <div className="ac-act-head">
          <Head r={r} />
        </div>
      )}
    </li>
  );
}

/**
 * An account's Activity: everything that's happened, filterable by kind,
 * date and words, newest first in months. Takes its rows rather than reading
 * them (lib/account-activity.js on the real page, sample rows in the admin's
 * account tour), and links through `hrefFor(query)`, so both can use it.
 *
 *   rows      already filtered (lib/activity-feed.js filterActivity)
 *   f         readFilters() · counts per type · types present · total unfiltered
 *   action    where the search and date forms go; `keep` = hidden fields they carry
 *   emailHref (id) → where one email opens
 */
export default function ActivityFeed({ email, rows, f, counts, types, total, hrefFor, action, keep = {}, emailHref }) {
  const shown = rows.slice(0, PAGE + f.more);
  const months = [];
  for (const r of shown) {
    const m = monthOf(r.at);
    if (months.at(-1)?.label !== m) months.push({ label: m, rows: [] });
    months.at(-1).rows.push(r);
  }
  const filtered = f.type !== "all" || f.period !== "all" || f.q;
  // What each form carries over from the other filters.
  const carry = { ...keep, type: f.type !== "all" ? f.type : "" };
  const dates = f.period === "custom" ? { from: f.from, to: f.to } : { period: f.period !== "all" ? f.period : "" };
  const hidden = (fields) =>
    Object.entries(fields)
      .filter(([, v]) => v)
      .map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />);

  return (
    <>
      <header className="ac-hello">
        <p className="ac-eyebrow ac-date ac-rise">Activity</p>
        <h1 className="ac-title ac-rise ac-rise-1">Everything that&apos;s happened</h1>
        <p className="ac-lede ac-rise ac-rise-2">
          Bookings, payments and receipts, sales, drop-offs, payouts, agreements and every email we&apos;ve sent {email} — in one
          place. Tap one to see the details.
        </p>
      </header>

      <div className="ac-filters ac-rise ac-rise-3">
        <nav className="ac-chips" aria-label="What to show">
          {[{ key: "all", label: "Everything" }, ...types].map((t) => (
            <Link
              key={t.key}
              href={hrefFor(filterQuery(f, { type: t.key }))}
              className="ac-chip"
              aria-current={f.type === t.key ? "true" : undefined}
              scroll={false}
            >
              {t.label}
              <span className="ac-chip-n">{counts[t.key] || 0}</span>
            </Link>
          ))}
        </nav>

        <div className="ac-filter-row">
          <nav className="ac-chips ac-chips--quiet" aria-label="When">
            {PERIODS.map((p) => (
              <Link
                key={p.key}
                href={hrefFor(filterQuery(f, { period: p.key, from: null, to: null }))}
                className="ac-chip"
                aria-current={f.period === p.key ? "true" : undefined}
                scroll={false}
              >
                {p.label}
              </Link>
            ))}
            <details className="ac-pick" open={f.period === "custom" || undefined}>
              <summary className="ac-chip" aria-current={f.period === "custom" ? "true" : undefined}>
                Pick dates
              </summary>
              <form method="get" action={action} className="ac-pick-form">
                {hidden({ ...carry, q: f.q })}
                <label>
                  <span className="ac-label">From</span>
                  <input type="date" name="from" defaultValue={f.period === "custom" ? f.from || "" : ""} className="ac-input ac-input--sm" />
                </label>
                <label>
                  <span className="ac-label">To</span>
                  <input type="date" name="to" defaultValue={f.period === "custom" ? f.to || "" : ""} className="ac-input ac-input--sm" />
                </label>
                <button type="submit" className="ac-btn ac-btn--auto ac-btn--sm">Show</button>
              </form>
            </details>
          </nav>

          <form method="get" action={action} className="ac-search" role="search">
            {hidden({ ...carry, ...dates })}
            <Search aria-hidden="true" width={16} height={16} />
            <input type="search" name="q" defaultValue={f.q} placeholder="Search your activity" aria-label="Search your activity" />
          </form>
        </div>

        <p className="ac-small ac-filter-sum">
          {rows.length === total ? `${total} ${total === 1 ? "thing" : "things"}` : `${rows.length} of ${total}`}
          {filtered ? (
            <>
              {" · "}
              <Link href={hrefFor("")} className="ac-link ac-link--quiet" scroll={false}>
                Clear filters
              </Link>
            </>
          ) : null}
        </p>
      </div>

      {months.length ? (
        months.map((m) => (
          <section key={m.label} className="ac-act-month ac-rise ac-rise-4">
            <h2 className="ac-act-month-h">{m.label}</h2>
            <ul className="ac-act">
              {m.rows.map((r) => (
                <Row key={r.key} r={r} emailHref={emailHref} />
              ))}
            </ul>
          </section>
        ))
      ) : (
        <div className="ac-set-card ac-rise ac-rise-4">
          <p className="ac-tile-body">
            {total ? "Nothing matches those filters." : "Nothing yet. Bookings, payments, sales and every email we send you will show up here."}
          </p>
        </div>
      )}

      {rows.length > shown.length ? (
        <p style={{ marginTop: 24, textAlign: "center" }}>
          <Link href={hrefFor(filterQuery(f, { more: f.more + PAGE }))} className="ac-btn ac-btn--ghost ac-btn--auto" scroll={false}>
            Show more ({rows.length - shown.length} left)
          </Link>
        </p>
      ) : null}
    </>
  );
}

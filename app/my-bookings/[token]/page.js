import Link from "next/link";
import {
  getClientPortalByToken,
  touchClientPortal,
} from "@/lib/portal.js";
import {
  listBookingsForClient,
  groupClientBookings,
  canReschedule,
  rentalAmount,
} from "@/lib/bookings.js";
import { getDraftEventForBooking } from "@/lib/catalog.js";
import {
  spaceName,
  formatDate,
  formatDateShort,
  formatTime,
  formatMoney,
  venueToday,
} from "@/lib/constants.js";

export const metadata = {
  title: "Your bookings",
  // A private link. It should never turn up in a search result, and the token
  // should never leave in a referrer header.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

// Per-token data — it must never be cached and served to the next visitor.
export const dynamic = "force-dynamic";

const PHONE = "(435) 512-4608";
const MAILTO = "thealleyoncenter@gmail.com";

/** Shared page shell so every state looks like the other host-facing pages. */
function Shell({ children }) {
  return (
    <main className="brandpage min-h-screen bg-paper-warm">
      <header className="border-b border-ink/10 bg-paper">
        <div className="container-content flex items-center justify-between py-4">
          <Link href="/" className="font-display text-xl font-semibold text-ink">
            The Alley <span className="text-brass-dark">On Center</span>
          </Link>
          <span className="text-sm text-ink-muted">Your bookings</span>
        </div>
      </header>
      <div className="container-content max-w-3xl py-10">{children}</div>
    </main>
  );
}

/** Colour-coded state pill. Deliberately plain-language, not our status words. */
function Chip({ tone = "neutral", children }) {
  const tones = {
    good: "border-verde-deep/30 bg-verde/30 text-verde-deep",
    warn: "border-gold/40 bg-gold/10 text-ink-soft",
    bad: "border-rust/30 bg-rust/10 text-rust",
    neutral: "border-ink/15 bg-ink/5 text-ink-soft",
  };
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * How a client should read a booking's status — not the raw word. "Reserved"
 * and "held" mean nothing to someone who booked a room; "Your date is booked"
 * does.
 */
function statusChip(b) {
  switch (b.status) {
    case "pending":
      return <Chip tone="warn">Awaiting approval</Chip>;
    case "held":
      return <Chip tone="warn">Held for you</Chip>;
    case "reserved":
    case "confirmed":
      return <Chip tone="good">Booked</Chip>;
    case "completed":
      return <Chip tone="neutral">Finished</Chip>;
    case "cancelled":
      return <Chip tone="bad">Cancelled</Chip>;
    case "denied":
      return <Chip tone="bad">Not available</Chip>;
    case "expired":
      return <Chip tone="bad">Hold expired</Chip>;
    default:
      return null;
  }
}

/** The money state for one booking, with its pay button when something's due. */
function PaymentLine({ b }) {
  const isHolder = Boolean(b.series_id && b.is_deposit_holder);
  // A pending request hasn't been priced or invoiced yet — quoting a number
  // here would read as a bill for something nobody has agreed to.
  if (b.status === "pending") {
    return (
      <p className="text-sm text-ink-muted">
        We&rsquo;ll confirm the price when we approve this.
      </p>
    );
  }
  if (Number(b.total) === 0) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone="good">On us</Chip>
        <span className="text-sm text-ink-muted">No charge for this one.</span>
      </div>
    );
  }
  const amount = isHolder ? rentalAmount(b) : Number(b.total) || 0;
  const rentalPaid = b.payment_status === "paid" || b.payment_status === "refunded";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="font-semibold text-ink">{formatMoney(amount)}</span>
      {rentalPaid ? <Chip tone="good">Paid</Chip> : <Chip tone="warn">Unpaid</Chip>}
      {!rentalPaid && b.payment_link ? (
        <a
          href={b.payment_link}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-semibold text-brass-dark hover:underline"
        >
          Pay now →
        </a>
      ) : null}
      {!rentalPaid && b.status === "held" && b.hold_expires_at ? (
        <span className="text-sm text-ink-muted">
          Please pay by {formatDateShort(String(b.hold_expires_at).slice(0, 10))}
        </span>
      ) : null}
    </div>
  );
}

/**
 * The cleaning deposit, which behaves differently either side of the event and
 * differently again for a series (its own invoice on the holder).
 */
function DepositLine({ b }) {
  const amount = Number(b.deposit) || 0;
  if (amount <= 0) return null;
  // Nothing about a pending request is agreed yet, so naming a deposit figure
  // directly under "we'll confirm the price when we approve this" contradicts it.
  if (b.status === "pending") return null;
  const isHolder = Boolean(b.series_id && b.is_deposit_holder);
  const refunded = Number(b.deposit_refunded) || 0;

  if (b.deposit_status === "refunded") {
    return (
      <p className="text-sm text-ink-muted">
        Cleaning deposit {formatMoney(amount)} — <strong className="text-verde-deep">refunded</strong>
        {refunded && refunded !== amount ? ` (${formatMoney(refunded)})` : ""}.
      </p>
    );
  }
  if (b.deposit_status === "withheld") {
    return (
      <p className="text-sm text-ink-muted">
        Cleaning deposit {formatMoney(amount)} — kept to cover cleaning or damage
        {b.deposit_reason ? `: ${b.deposit_reason}` : ""}.
      </p>
    );
  }
  // Still pending. For a series it's invoiced separately, so it may be unpaid.
  if (isHolder && b.deposit_payment_status !== "paid") {
    return (
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
        <span>Cleaning deposit {formatMoney(amount)} — not yet paid.</span>
        {b.deposit_payment_link ? (
          <a
            href={b.deposit_payment_link}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-brass-dark hover:underline"
          >
            Pay deposit →
          </a>
        ) : null}
      </p>
    );
  }
  return (
    <p className="text-sm text-ink-muted">
      Cleaning deposit {formatMoney(amount)} — refundable after your event, once
      the space has been checked over.
    </p>
  );
}

/** Links to the things they can already do, gathered in one place. */
function Actions({ entry }) {
  const rep = entry.booking;
  const links = [];

  // Change-date: only when the booking itself allows it AND a token exists. We
  // deliberately don't mint one here — a page render shouldn't create a
  // credential, and the link is minted when an email that carries it goes out.
  const movable = entry.sessions.filter(
    (b) => b.reschedule_token && canReschedule(b, { source: "client" }).ok
  );
  for (const b of movable.slice(0, 3)) {
    links.push({
      href: `/reschedule/${b.reschedule_token}`,
      label:
        entry.kind === "series"
          ? `Change ${formatDateShort(b.date)}`
          : "Change my date",
    });
  }

  const listing = getDraftEventForBooking(rep.id);
  if (listing?.host_token) {
    links.push({
      href: `/host-listing/${listing.host_token}`,
      label: listing.host_posted ? "Edit my public listing" : "Post my event listing",
    });
  }

  if (!links.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t border-ink/10 pt-3">
      {links.map((l) => (
        <Link
          key={l.href + l.label}
          href={l.href}
          className="text-sm font-semibold text-ink-soft hover:text-ink hover:underline"
        >
          {l.label} →
        </Link>
      ))}
    </div>
  );
}

function SingleCard({ entry }) {
  const b = entry.booking;
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-lg font-semibold text-ink">
            {b.event_title || spaceName(b.space)}
          </p>
          <p className="text-sm text-ink-muted">
            {formatDate(b.date)} · {formatTime(b.start_time)}
            {b.hours ? ` · ${b.hours}h` : ""} · {spaceName(b.space)}
          </p>
        </div>
        {statusChip(b)}
      </div>
      <div className="mt-3 space-y-1.5">
        <PaymentLine b={b} />
        <DepositLine b={b} />
      </div>
      <Actions entry={entry} />
    </div>
  );
}

function SeriesCard({ entry }) {
  const rep = entry.booking;
  const live = entry.sessions.filter(
    (s) => !["cancelled", "denied", "expired"].includes(s.status)
  );
  const paidCount = live.filter((s) => s.payment_status === "paid").length;
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-lg font-semibold text-ink">
            {rep.event_title || "Recurring booking"}
          </p>
          <p className="text-sm text-ink-muted">
            {live.length} session{live.length === 1 ? "" : "s"} · {spaceName(rep.space)}
            {rep.recurring_schedule ? ` · ${rep.recurring_schedule}` : ""}
          </p>
        </div>
        <Chip tone={entry.outstanding > 0 ? "warn" : "good"}>
          {paidCount} of {live.length} paid
        </Chip>
      </div>

      <DepositLine b={rep} />

      {/* Each session is invoiced on its own a few days ahead, so each has its
          own paid/unpaid — the single thing this page exists to make legible. */}
      <ul className="mt-3 divide-y divide-ink/10 border-t border-ink/10">
        {entry.sessions.map((s) => {
          const dead = ["cancelled", "denied", "expired"].includes(s.status);
          const paid = s.payment_status === "paid" || s.payment_status === "refunded";
          return (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-sm"
            >
              <span className={dead ? "text-ink-muted line-through" : "text-ink"}>
                {formatDateShort(s.date)} · {formatTime(s.start_time)}
                {s.session_title ? ` · ${s.session_title}` : ""}
              </span>
              <span className="flex flex-wrap items-center gap-2">
                {dead ? (
                  statusChip(s)
                ) : Number(s.total) === 0 ? (
                  <Chip tone="good">On us</Chip>
                ) : paid ? (
                  <>
                    <span className="text-ink-muted">{formatMoney(rentalAmount(s))}</span>
                    <Chip tone="good">Paid</Chip>
                  </>
                ) : (
                  <>
                    <span className="text-ink-muted">{formatMoney(rentalAmount(s))}</span>
                    {s.payment_link ? (
                      <a
                        href={s.payment_link}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-brass-dark hover:underline"
                      >
                        Pay →
                      </a>
                    ) : (
                      <Chip tone="neutral">Invoice to come</Chip>
                    )}
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <Actions entry={entry} />
    </div>
  );
}

function Card({ entry }) {
  return entry.kind === "series" ? <SeriesCard entry={entry} /> : <SingleCard entry={entry} />;
}

function Section({ title, entries, empty }) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-xl font-semibold text-ink">{title}</h2>
      {entries.length ? (
        <div className="mt-3 space-y-3">
          {entries.map((e) => (
            <Card key={e.key} entry={e} />
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-ink-muted">{empty}</p>
      )}
    </section>
  );
}

function NotFound() {
  return (
    <Shell>
      <div className="card mx-auto max-w-md p-8 text-center">
        <h1 className="font-display text-2xl font-semibold text-ink">Link not found</h1>
        <p className="mt-3 text-ink-muted">
          This link isn&rsquo;t valid — it may have been replaced by a newer one.
          Check the most recent email we sent you, or give us a call on{" "}
          <a className="font-semibold text-brass-dark hover:underline" href={`tel:${PHONE.replace(/\D/g, "")}`}>
            {PHONE}
          </a>{" "}
          and we&rsquo;ll sort it out.
        </p>
        <Link href="/" className="btn-primary mt-6">
          Visit The Alley
        </Link>
      </div>
    </Shell>
  );
}

export default function MyBookingsPage({ params }) {
  const portal = getClientPortalByToken(params.token);
  // A bad token must never 500 — it lands on a human explanation instead.
  if (!portal) return <NotFound />;
  touchClientPortal(portal.id);

  const rows = listBookingsForClient(portal.email);
  const { upcoming, past, inactive, outstanding } = groupClientBookings(rows, {
    today: venueToday(),
  });
  const name = rows.length ? rows[rows.length - 1].client_name : "";

  return (
    <Shell>
      <p className="eyebrow">Your private link</p>
      <h1 className="mt-2 font-display text-3xl font-semibold text-ink">
        {name ? `Hi ${String(name).split(" ")[0]}` : "Your bookings"}
      </h1>
      <p className="mt-2 text-ink-muted">
        Everything you&rsquo;ve booked at The Alley, and where each one stands.
        Bookmark this link — it always shows your latest.
      </p>

      {rows.length === 0 ? (
        <div className="card mt-8 p-6 text-center">
          <p className="text-ink-muted">
            Nothing here yet. Once you&rsquo;ve booked with us, it&rsquo;ll show up on this page.
          </p>
          <Link href="/book" className="btn-accent mt-5">
            Request a space →
          </Link>
        </div>
      ) : (
        <>
          {outstanding > 0 ? (
            <div className="mt-6 rounded-xl border border-gold/40 bg-gold/10 px-5 py-4">
              <p className="font-semibold text-ink">
                {formatMoney(outstanding)} still to pay
              </p>
              <p className="mt-0.5 text-sm text-ink-soft">
                The &ldquo;Pay&rdquo; links below take you straight to the right invoice.
              </p>
            </div>
          ) : upcoming.length ? (
            <div className="mt-6 rounded-xl border border-verde-deep/30 bg-verde/30 px-5 py-4">
              <p className="font-semibold text-ink">You&rsquo;re all paid up.</p>
            </div>
          ) : null}

          <Section
            title="Coming up"
            entries={upcoming}
            empty="Nothing booked at the moment."
          />
          {past.length ? <Section title="Already happened" entries={past} empty="" /> : null}
          {inactive.length ? (
            <details className="mt-8">
              <summary className="cursor-pointer text-sm font-semibold text-ink-soft hover:text-ink">
                Not going ahead ({inactive.length})
              </summary>
              <div className="mt-3 space-y-3">
                {inactive.map((e) => (
                  <Card key={e.key} entry={e} />
                ))}
              </div>
            </details>
          ) : null}
        </>
      )}

      <p className="mt-10 border-t border-ink/10 pt-6 text-sm text-ink-muted">
        Something look wrong? Call us on{" "}
        <a className="font-semibold text-brass-dark hover:underline" href={`tel:${PHONE.replace(/\D/g, "")}`}>
          {PHONE}
        </a>{" "}
        or email{" "}
        <a className="font-semibold text-brass-dark hover:underline" href={`mailto:${MAILTO}`}>
          {MAILTO}
        </a>
        .
      </p>
    </Shell>
  );
}

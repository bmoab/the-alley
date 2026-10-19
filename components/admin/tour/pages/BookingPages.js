import Link from "next/link";
import { PortalHead } from "@/components/account/PortalFrame.js";
import HostListingForm from "@/components/HostListingForm.js";
import { tourHref } from "@/lib/account-tour.js";
import { tourNoop } from "@/components/admin/tour/actions.js";
import { spaceName, formatDate, formatTime, formatMoney, venueToday, shiftDate } from "@/lib/constants.js";

/**
 * The account tour's bookings page and event-listing page: the same markup as
 * app/my-bookings/[token] and app/host-listing/[token], filled with sample
 * bookings and listings. Nothing here reads the database.
 */

export const BOOKINGS_LABEL = "Your bookings";
export const LISTING_LABEL = "Event listing";

const PHONE = "(435) 512-4608";
const MAILTO = "thealleyoncenter@gmail.com";

const day = (n) => shiftDate(venueToday(), { days: n });

// ---------------------------------------------------------------------------
// Your bookings (app/my-bookings/[token]/page.js)
// ---------------------------------------------------------------------------

function sampleBookings(key) {
  if (key === "host") {
    return {
      name: "Sam Ortega",
      upcoming: [
        {
          id: 1,
          event_title: "Saturday Improv Night",
          space: "main",
          date: day(12),
          start_time: "18:00",
          hours: 4,
          status: "confirmed",
          total: 320,
          payment_status: "paid",
          deposit: 150,
          listing: { posted: true, id: 1 },
        },
        {
          id: 2,
          event_title: "Spring Pottery Class",
          space: "loft",
          date: day(40),
          start_time: "17:30",
          hours: 3.5,
          status: "confirmed",
          total: 210,
          payment_status: "paid",
          deposit: 100,
          listing: { posted: true, id: 2 },
        },
      ],
      past: [],
    };
  }
  return {
    name: "Riley Nguyen",
    upcoming: [
      {
        id: 1,
        event_title: "Book club",
        space: "loft",
        date: day(9),
        start_time: "18:30",
        hours: 3,
        status: "confirmed",
        total: 180,
        payment_status: "unpaid",
        payment_link: "#t-pay",
        deposit: 100,
        reschedule: true,
      },
      {
        id: 2,
        event_title: "Wedding shower",
        space: "main",
        date: day(24),
        start_time: "11:00",
        hours: 5,
        status: "reserved",
        total: 450,
        payment_status: "paid",
        deposit: 150,
        reschedule: true,
      },
    ],
    past: [
      {
        id: 3,
        event_title: "",
        space: "conference",
        date: day(-21),
        start_time: "09:00",
        hours: 2,
        status: "completed",
        total: 60,
        payment_status: "paid",
        deposit: 50,
        deposit_status: "refunded",
      },
    ],
  };
}

function Chip({ tone = "neutral", children }) {
  const tones = { good: "ac-pill--live", warn: "ac-pill--wait", bad: "ac-pill--bad", neutral: "" };
  return <span className={`ac-pill ${tones[tone] || ""}`}>{children}</span>;
}

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
    default:
      return null;
  }
}

function PaymentLine({ b }) {
  const paid = b.payment_status === "paid";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="font-semibold text-ink">{formatMoney(b.total)}</span>
      {paid ? <Chip tone="good">Paid</Chip> : <Chip tone="warn">Unpaid</Chip>}
      {!paid && b.payment_link ? (
        <a href={b.payment_link} className="ac-btn ac-btn--auto" style={{ height: 40, padding: "0 18px", fontSize: 11 }}>
          Pay now <span className="ac-arrow" aria-hidden="true">→</span>
        </a>
      ) : null}
    </div>
  );
}

function DepositLine({ b }) {
  if (!b.deposit) return null;
  if (b.deposit_status === "refunded") {
    return (
      <p className="text-sm text-ink-muted">
        Cleaning deposit {formatMoney(b.deposit)} — <strong className="text-verde-deep">refunded</strong>.
      </p>
    );
  }
  return (
    <p className="text-sm text-ink-muted">
      Cleaning deposit {formatMoney(b.deposit)} — refundable after your event, once the space has been checked over.
    </p>
  );
}

function Actions({ b, m }) {
  const links = [];
  if (b.reschedule) links.push({ href: "#t-reschedule", label: "Change my date" });
  if (b.listing) {
    links.push({
      href: tourHref(m.key, "listing", b.listing.id),
      label: b.listing.posted ? "Edit my public listing" : "Post my event listing",
    });
  }
  if (!links.length) return null;
  return (
    <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-ink/10 pt-4">
      {links.map((l) => (
        <Link key={l.label} href={l.href} className="ac-tile-go">
          {l.label} <span className="ac-arrow" aria-hidden="true">→</span>
        </Link>
      ))}
    </div>
  );
}

function BookingCard({ b, m }) {
  return (
    <div className="card ac-rise" style={{ padding: "24px 26px" }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="ac-tile-title" style={{ marginTop: 0 }}>
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
      <Actions b={b} m={m} />
    </div>
  );
}

function Section({ title, list, m }) {
  return (
    <section className="ac-section" style={{ marginTop: 44 }}>
      <div className="ac-section-head">
        <h2 className="ac-h2">{title}</h2>
      </div>
      <div className="mt-3 space-y-3">
        {list.map((b) => (
          <BookingCard key={b.id} b={b} m={m} />
        ))}
      </div>
    </section>
  );
}

/** Signed in, the private-link pages say so (AccountNudge's signed-in line). */
function SignedIn({ m }) {
  return (
    <p className="ac-note" style={{ marginTop: 20 }}>
      <span>
        You&apos;re signed in.{" "}
        <Link href={tourHref(m.key)} style={{ fontWeight: 600, textDecoration: "underline" }}>
          Your account
        </Link>{" "}
        has this and everything else you have with us.
      </span>
    </p>
  );
}

export function TourBookings({ m }) {
  const { name, upcoming, past } = sampleBookings(m.key);
  const outstanding = upcoming
    .filter((b) => b.payment_status !== "paid")
    .reduce((t, b) => t + Number(b.total || 0), 0);
  return (
    <>
      <PortalHead eyebrow="Your bookings" title={<>Hi, <em>{name.split(" ")[0]}</em>.</>}>
        Everything you&rsquo;ve booked at The Alley, and where each one stands.
      </PortalHead>
      <SignedIn m={m} />

      {outstanding > 0 ? (
        <div className="card ac-figure" style={{ marginTop: 28, padding: "22px 26px", borderLeft: "3px solid #c9973a" }}>
          <b>{formatMoney(outstanding)}</b>
          <span>Still to pay</span>
          <p className="ac-small" style={{ margin: "6px 0 0" }}>The &ldquo;Pay&rdquo; links below take you straight to the right invoice.</p>
        </div>
      ) : upcoming.length ? (
        <p className="ac-note" style={{ marginTop: 28 }}>You&rsquo;re all paid up.</p>
      ) : null}

      <Section title="Coming up" list={upcoming} m={m} />
      {past.length ? <Section title="Already happened" list={past} m={m} /> : null}

      <p className="ac-small" style={{ marginTop: 56, paddingTop: 24, borderTop: "1px solid var(--line)" }}>
        Something look wrong? Call us on{" "}
        <a className="font-semibold text-ink underline" href={`tel:${PHONE.replace(/\D/g, "")}`}>
          {PHONE}
        </a>{" "}
        or email{" "}
        <a className="font-semibold text-ink underline" href={`mailto:${MAILTO}`}>
          {MAILTO}
        </a>
        .
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Event listing (app/host-listing/[token]/page.js)
// ---------------------------------------------------------------------------

const LISTINGS = {
  1: {
    id: 1,
    title: "Saturday Improv Night",
    description:
      "Two hours of short-form improv from the Cache Valley Players, built on your suggestions. Doors at 6:30, show at 7. Family friendly.",
    space: "main",
    date: 12,
    time: "18:00",
    public_time: "18:30",
    public_end_time: "21:00",
    tickets: 60,
    price: "$10 at the door",
    payment_instructions: "Pay at the door — cash or card.",
    payment_link: "",
    links: JSON.stringify([{ label: "Instagram", url: "https://instagram.com/cachevalleyplayers" }]),
    status: "live",
    host_posted: 1,
    window: { start: "18:00", end: "22:00" },
  },
  2: {
    id: 2,
    title: "Spring Pottery Class",
    description: "An evening on the wheel for beginners. Clay, glazes and firing included — just bring clothes that can get messy.",
    space: "loft",
    date: 40,
    time: "18:00",
    public_time: "18:00",
    public_end_time: "20:30",
    tickets: 12,
    price: "$45",
    payment_instructions: "",
    payment_link: "https://square.link/u/pottery",
    links: "[]",
    status: "pending",
    host_posted: 1,
    window: { start: "17:30", end: "21:00" },
  },
  3: {
    id: 3,
    title: "",
    description: "",
    space: "conference",
    date: 55,
    time: "10:00",
    status: "draft",
    host_posted: 0,
    window: { start: "10:00", end: "13:00" },
  },
  4: {
    id: 4,
    title: "Free bang trims",
    description: "Walk in for a free bang trim at Lucid Hair Collective, upstairs in Suite 2. First come, first served.",
    space: "",
    date: 9,
    time: "10:00",
    public_time: "10:00",
    public_end_time: "14:00",
    tickets: "",
    price: "Free",
    payment_instructions: "",
    payment_link: "",
    links: "[]",
    status: "live",
    host_posted: 1,
    window: null,
  },
};

export function TourListing({ m, id }) {
  const sample = LISTINGS[Number(id)] || (m.key === "tenant" ? LISTINGS[4] : LISTINGS[1]);
  const { window: bookingWindow, date, ...rest } = sample;
  const event = { ...rest, date: day(date), pdf_paths: "[]", photo_path: "" };
  // Same rules as the real page: live or hidden listings are the host's to
  // show or hide; before that, the owner reviews it (auto-publish is off).
  const canSetVisibility = event.status === "live" || event.status === "private";
  const needsReview = !canSetVisibility;
  return (
    <>
      <PortalHead eyebrow="Your private posting link" title={canSetVisibility ? "Your event listing" : "Post your event"}>
        {canSetVisibility ? (
          <>
            Change anything below and save — your edits go straight to The Alley&apos;s calendar, no waiting. Whether it
            shows publicly at all is up to you, down in &ldquo;Who can see this&rdquo;.
          </>
        ) : (
          <>
            Share your event with The Alley community: the details, a flyer, and how to pay you.
            {needsReview ? " We’ll do a quick review before it goes live." : " It goes on the calendar as soon as you post it."}
          </>
        )}
      </PortalHead>
      <SignedIn m={m} />

      <div style={{ marginTop: 36 }}>
        <HostListingForm
          event={event}
          saveAction={tourNoop}
          alreadyLive={event.status === "live"}
          canSetVisibility={canSetVisibility}
          needsReview={needsReview}
          lastEvent={null}
          sessions={[]}
          bookingWindow={bookingWindow}
        />
      </div>
    </>
  );
}

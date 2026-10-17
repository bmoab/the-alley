import Link from "next/link";
import { CalendarDays, ChevronDown, ChevronRight, Inbox, Megaphone, Package, Palette, Store } from "lucide-react";
import { requireAccount, whatsMine, listInbox } from "@/lib/accounts.js";
import TenantBills from "@/components/account/TenantBills.js";
import { makerOverview } from "@/lib/inventory.js";
import { formatDate, formatDateShort, formatMoney, venueNow, venueToday } from "@/lib/constants.js";

export const metadata = { title: "Your account" };

const LISTING_STATUS = {
  draft: { cls: "ac-pill--wait", label: "Not finished" },
  pending: { cls: "ac-pill--wait", label: "In review" },
  live: { cls: "ac-pill--live", label: "On the calendar" },
  private: { cls: "", label: "Private" },
};

function greeting() {
  const h = Number(venueNow().slice(11, 13));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function todayLabel() {
  const [y, m, d] = venueToday().split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

/**
 * Everything an account can do, whether or not this person does it yet. The
 * tiles above only show what they HAVE; this is where the rest lives, folded
 * away, each with a line on what it is and how to start.
 */
const FEATURES = [
  {
    key: "bookings",
    icon: CalendarDays,
    title: "Book a room",
    body: "Rent the Main Floor, the Loft or the Conference Room for a class, party, meeting or workshop. Send a request, we confirm it, and you pay online — your bookings, receipts and date changes all live here.",
    cta: ["Request a room", "/book"],
  },
  {
    key: "listings",
    icon: Megaphone,
    title: "Put your event on our calendar",
    body: "Hosting something in a room you've booked? List it on our public calendar with a flyer, times and how people pay you. You'll get a link to post it once your booking is approved.",
    cta: ["See the calendar", "/calendar"],
  },
  {
    key: "makers",
    icon: Package,
    title: "Sell your work in the shop",
    body: "Bring handmade goods in on consignment. You list a drop-off here, we count it in and tag it, and you're paid your share every month — with every sale and payout shown here.",
    cta: ["Ask about selling", "/contact"],
  },
  {
    key: "exhibitors",
    icon: Palette,
    title: "Show your art in the gallery",
    body: "Gallery artists get their own page on our Exhibitors list — a bio, a photo and pieces of their work — and can update it any time from here.",
    cta: ["See the gallery", "/exhibitors"],
  },
  {
    key: "businesses",
    icon: Store,
    title: "Your business in the building",
    body: "Tenants get a page in our directory, can post the events they run in their own space, and see their rent and shared bills here with a Pay button.",
    cta: ["See the directory", "/directory"],
  },
  {
    key: "inbox",
    icon: Inbox,
    title: "Every email in one place",
    body: "A copy of every email we send you — confirmations, invoices, receipts, payouts — is kept in your Inbox, so nothing gets lost in your email.",
    cta: ["Open your inbox", "/account/inbox"],
  },
];

function Explore({ mine }) {
  const have = {
    bookings: mine.bookings.total > 0,
    listings: mine.listings.length > 0,
    makers: mine.makers.length > 0,
    exhibitors: mine.exhibitors.length > 0,
    businesses: mine.businesses.length > 0,
    inbox: true,
  };
  return (
    <section className="ac-section ac-rise ac-rise-5" id="explore">
      <div className="ac-section-head">
        <h2 className="ac-h2">Everything you can do here</h2>
        <span className="ac-small">Tap one to see how it works</span>
      </div>
      <div className="ac-explore">
        {FEATURES.map(({ key, icon: Icon, title, body, cta }) => (
          <details key={key} className="ac-explore-item">
            <summary>
              <span className="ac-icon" style={{ width: 38, height: 38 }}>
                <Icon aria-hidden="true" />
              </span>
              <span className="ac-row-main">
                <span className="ac-row-title" style={{ whiteSpace: "normal" }}>{title}</span>
              </span>
              {have[key] ? <span className="ac-pill ac-pill--live">You&apos;re set up</span> : null}
              <ChevronDown className="ac-explore-chev" width={18} height={18} aria-hidden="true" />
            </summary>
            <div className="ac-explore-body">
              <p className="ac-tile-body">{body}</p>
              {!have[key] || key === "inbox" ? (
                <Link href={cta[1]} className="ac-tile-go" style={{ marginTop: 14 }}>
                  {cta[0]} <span className="ac-arrow" aria-hidden="true">→</span>
                </Link>
              ) : (
                <p className="ac-small" style={{ marginTop: 10 }}>It&apos;s on your dashboard above.</p>
              )}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

function Tile({ href, icon: Icon, eyebrow, title, children, go = "Open", wide = false }) {
  const Tag = href ? Link : "div";
  return (
    <Tag href={href} className={`ac-tile ac-rise ${wide ? "ac-tile--wide" : ""}`}>
      <div className="ac-tile-head">
        <span className="ac-icon">
          <Icon aria-hidden="true" />
        </span>
        <div style={{ minWidth: 0 }}>
          <p className="ac-eyebrow">{eyebrow}</p>
          <h2 className="ac-tile-title">{title}</h2>
        </div>
      </div>
      {children}
      {href ? (
        <div className="ac-tile-foot">
          <span className="ac-tile-go">
            {go} <span className="ac-arrow" aria-hidden="true">→</span>
          </span>
        </div>
      ) : null}
    </Tag>
  );
}

/**
 * Everything this person has with The Alley, gathered by their (proven) email:
 * consignment, bookings, event listings, a tenant's business listing, an
 * exhibitor page — plus the newest emails we've sent them.
 */
export default async function AccountHome() {
  const account = await requireAccount();
  const mine = whatsMine(account.email);
  const inbox = listInbox(account.email, { limit: 4 });
  const first = account.name ? account.name.trim().split(/\s+/)[0] : "";
  const nothing =
    !mine.makers.length && !mine.bookings.total && !mine.listings.length && !mine.businesses.length && !mine.exhibitors.length;

  // The tiles, in order. An odd one out stretches across the row, so the grid
  // never ends on an empty half.
  const tiles = [
    ...mine.makers.map((m) => (wide) => {
      const o = makerOverview(m.id);
      const waiting = o.dropoffs.some((d) => d.status === "submitted");
      return (
        <Tile key={`m${m.id}`} wide={wide} href={`/account/consign/${m.id}`} icon={Package} eyebrow="Consignment" title={m.name}>
          <div className="ac-figures">
            <div className="ac-figure">
              <b>{o.onShelf}</b>
              <span>On the shelf</span>
            </div>
            <div className="ac-figure">
              <b>{formatMoney(o.soFarThisMonth)}</b>
              <span>Yours this month</span>
            </div>
            {o.due ? (
              <div className="ac-figure">
                <b>{formatMoney(o.due)}</b>
                <span>Payout coming</span>
              </div>
            ) : null}
          </div>
          {waiting ? <p className="ac-tile-body">You have a drop-off waiting to be brought in.</p> : null}
        </Tile>
      );
    }),
    ...(mine.bookings.total
      ? [
          (wide) => (
            <Tile key="bookings" wide={wide} href={`/my-bookings/${mine.bookings.portalToken}`} icon={CalendarDays} eyebrow="Room bookings" title="Your bookings" go="See them all">
              <div className="ac-figures">
                <div className="ac-figure">
                  <b>{mine.bookings.upcoming}</b>
                  <span>Coming up</span>
                </div>
                <div className="ac-figure">
                  <b>{mine.bookings.total}</b>
                  <span>In all</span>
                </div>
              </div>
              <p className="ac-tile-body">Pay, see what you owe, or change a date.</p>
            </Tile>
          ),
        ]
      : []),
    ...mine.businesses.map((b) => (wide) => (
      <Tile key={`b${b.id}`} wide={wide} href={`/business-listing/${b.token}`} icon={Store} eyebrow="Your business" title={b.business_name} go="Edit">
        <p className="ac-tile-body">Your directory listing, and the events you post on our calendar.</p>
      </Tile>
    )),
    ...mine.exhibitors.map((x) => (wide) => (
      <Tile key={`x${x.id}`} wide={wide} href={`/exhibitor/${x.token}`} icon={Palette} eyebrow="Gallery" title={x.name} go="Edit">
        <p className="ac-tile-body">Your exhibitor profile and artwork in our gallery.</p>
      </Tile>
    )),
  ];

  return (
    <>
      <header className="ac-hello">
        <p className="ac-eyebrow ac-date ac-rise">{todayLabel()}</p>
        <h1 className="ac-title ac-rise ac-rise-1">
          {greeting()}
          {first ? (
            <>
              , <em>{first}</em>
            </>
          ) : null}
          .
        </h1>
        <p className="ac-lede ac-rise ac-rise-2">
          {nothing ? "Welcome to your Alley account." : "Here's everything you have with The Alley."}
        </p>
      </header>

      {nothing ? (
        <section className="ac-empty ac-rise ac-rise-3">
          <p className="ac-eyebrow">Nothing here yet</p>
          <p className="ac-h2" style={{ marginTop: 10, fontSize: 26 }}>
            Book a room, list an event or sell your work with us
          </p>
          <p className="ac-lede" style={{ maxWidth: 520, margin: "12px auto 0", fontSize: 16 }}>
            It all shows up here under {account.email}. Used a different email with us before? Ask us to update it.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center", marginTop: 26 }}>
            <a href="#explore" className="ac-btn ac-btn--auto">
              See what you can do <span className="ac-arrow" aria-hidden="true">↓</span>
            </a>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/building-front.webp" alt="" className="ac-empty-art" />
        </section>
      ) : (
        <div className="ac-grid">
          {mine.businesses.map((b) => (
            <TenantBills key={`bills${b.id}`} directoryId={b.id} name={mine.businesses.length > 1 ? b.business_name : ""} />
          ))}
          {tiles.map((render, i) => render(tiles.length % 2 === 1 && i === tiles.length - 1))}

          {mine.listings.length ? (
            <div className="ac-tile ac-tile--wide ac-rise">
              <div className="ac-tile-head">
                <span className="ac-icon">
                  <Megaphone aria-hidden="true" />
                </span>
                <div>
                  <p className="ac-eyebrow">Event listings</p>
                  <h2 className="ac-tile-title">Your events</h2>
                </div>
              </div>
              <ul className="ac-rows">
                {mine.listings.map((e) => {
                  const st = LISTING_STATUS[e.status] || { cls: "", label: e.status };
                  return (
                    <li key={e.id}>
                      <Link href={`/host-listing/${e.host_token}`} className="ac-row">
                        <span className="ac-row-main">
                          <span className="ac-row-title">{e.title || "Untitled event"}</span>
                          <span className="ac-row-sub">{e.date ? formatDate(e.date) : "No date yet"}</span>
                        </span>
                        <span className={`ac-pill ${st.cls}`}>{st.label}</span>
                        <ChevronRight className="ac-row-chev" width={18} height={18} aria-hidden="true" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
      )}

      <Explore mine={mine} />

      <section className="ac-section ac-rise ac-rise-4">
        <div className="ac-section-head">
          <h2 className="ac-h2">Latest from us</h2>
          <Link href="/account/inbox" className="ac-link">Inbox</Link>
        </div>
        {inbox.length ? (
          <ul className="ac-rows">
            {inbox.map((m) => (
              <li key={m.id}>
                <Link href={`/account/inbox/${m.id}`} className="ac-row">
                  <span className="ac-row-main">
                    <span className="ac-row-title">{m.subject}</span>
                  </span>
                  <span className="ac-mail-date">{formatDateShort(m.sent_at.slice(0, 10))}</span>
                  <ChevronRight className="ac-row-chev" width={18} height={18} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ac-small">A copy of every email we send you will be kept here, so nothing gets lost in your inbox.</p>
        )}
      </section>
    </>
  );
}

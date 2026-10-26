import Link from "next/link";
import { PortalHead } from "@/components/account/PortalFrame.js";
import { TenantBillsCard } from "@/components/account/TenantBills.js";
import CalendarSubscribe from "@/components/account/CalendarSubscribe.js";
import DirectoryEditForm from "@/components/DirectoryEditForm.js";
import ExhibitorEditForm from "@/components/ExhibitorEditForm.js";
import DropoffForm from "@/components/maker/DropoffForm.js";
import PayoutMethodField from "@/components/maker/PayoutMethodField.js";
import SalesInsights from "@/components/maker/SalesInsights.js";
import Card from "@/components/admin/ui/Card.js";
import Badge from "@/components/admin/ui/Badge.js";
import Button from "@/components/admin/ui/Button.js";
import { tourHref } from "@/lib/account-tour.js";
import { tourNoop } from "@/components/admin/tour/actions.js";
import { venueToday, shiftDate, formatDate, formatDateShort, formatMoney, formatTime, calendarFeedUrl } from "@/lib/constants.js";

/**
 * The account tour's sample pages for a tenant's business listing, a gallery
 * artist's exhibitor page and a maker's shop page. Same markup and the same
 * edit forms as the real pages (app/business-listing, app/exhibitor,
 * components/maker/MakerHome.js), filled with sample data; nothing reads the
 * database and every save goes to tourNoop.
 */

export const BUSINESS_LABEL = "Business listing";
export const EXHIBITOR_LABEL = "Exhibitor page";

const day = (n) => shiftDate(venueToday(), { days: n });

/** The signed-in line AccountNudge shows on a private-link page. */
function SignedIn({ m }) {
  return (
    <p className="ac-note" style={{ marginTop: 20 }}>
      <span>
        You&apos;re signed in.{" "}
        <a href={tourHref(m.key)} style={{ fontWeight: 600, textDecoration: "underline" }}>
          Your account
        </a>{" "}
        has this and everything else you have with us.
      </span>
    </p>
  );
}

// ------------------------------------------------------------ business

const SAMPLE_BILLS = {
  rent: { amount: 1200, link: "#t-payrent" },
  unpaid: [],
  paid: [],
};

export function TourBusiness({ m }) {
  const bills = m.bills?.[1] || SAMPLE_BILLS;
  const event = {
    id: 4,
    title: "Free bang trims",
    date: day(9),
    public_time: "10:00",
    public_end_time: "14:00",
    description: "Walk in for a free bang trim between 10 and 2. No appointment needed.",
    price: "Free",
  };
  return (
    <div>
      <PortalHead eyebrow="Your private listing link" title="Lucid Hair Collective">
        Your spot in The Alley directory: your details, photos and links. Changes go live on our website right away.
      </PortalHead>
      <SignedIn m={m} />

      <div style={{ marginTop: 28 }}>
        <TenantBillsCard bills={bills} />
      </div>

      <div style={{ marginTop: 20 }}>
        <CalendarSubscribe feedUrl={calendarFeedUrl()} />
      </div>

      <div style={{ marginTop: 36 }}>
        <DirectoryEditForm
          entry={{
            business_name: "Lucid Hair Collective",
            category: "Salon",
            description:
              "A small, bright salon on the upper floor. Cuts, colour and curly-hair care from three stylists who take their time. Walk-ins welcome when the chairs are free.",
            links: [
              { label: "Book a chair", url: "https://lucidhair.example.com/book" },
              { label: "Instagram", url: "https://instagram.com/lucidhaircollective" },
            ],
            photos: ["/brand/building-front.webp"],
          }}
          saveAction={tourNoop}
        />
      </div>

      <div id="events" className="ac-section">
        <div className="ac-section-head">
          <h2 className="ac-h2">Your events on The Alley calendar</h2>
        </div>

        <div className="ac-note" style={{ display: "block", padding: "20px 22px" }}>
          <p className="font-semibold text-ink">This is a listing, not a booking.</p>
          <p className="mt-2 text-sm text-ink-soft">
            Posting here puts your event on The Alley&rsquo;s public calendar so visitors can see what&rsquo;s happening. It
            does <strong>not</strong> reserve any Alley space, and it doesn&rsquo;t stop anyone else booking that day.
          </p>
          <p className="mt-3 text-sm font-semibold text-ink">It&rsquo;s for things in your own space — for example:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink-soft">
            <li>a book signing or author night</li>
            <li>Tattoo Tuesdays, or any regular evening you run</li>
            <li>a late opening, a sale, or a guest artist in for the day</li>
          </ul>
          <p className="mt-3 text-sm text-ink-soft">
            <strong className="text-ink">Need a room to yourself?</strong> The Loft, the Main Floor and the Conference Room
            are booked separately — send a{" "}
            <Link href="/book" className="font-semibold text-ink underline">
              booking request
            </Link>{" "}
            and we&rsquo;ll confirm the space is held for you.
          </p>
        </div>

        <div className="mt-6 space-y-3">
          <details className="card p-5">
            <summary className="flex cursor-pointer items-center justify-between gap-3">
              <span>
                <span className="font-semibold text-ink">{event.title}</span>
                <span className="ml-2 text-sm text-ink-muted">
                  {formatDate(event.date)} · {formatTime(event.public_time)}
                </span>
              </span>
              <span className="shrink-0 text-xs text-ink-muted">edit ▾</span>
            </summary>
            <form action={tourNoop} className="mt-4 grid gap-3">
              <input type="hidden" name="id" value={event.id} />
              <EventFields ev={event} />
              <div className="flex flex-wrap items-center gap-3">
                <button type="submit" className="btn-accent">Save changes</button>
                <a href={tourHref(m.key, "listing", 4)} className="text-sm font-semibold text-ink-soft underline">
                  How it looks as a listing
                </a>
              </div>
            </form>
            <form action={tourNoop} className="mt-3 border-t border-ink/10 pt-3">
              <input type="hidden" name="id" value={event.id} />
              <button type="submit" className="text-sm font-semibold text-rust hover:underline">
                Remove from the calendar
              </button>
            </form>
          </details>
        </div>

        <details className="card mt-4 p-5">
          <summary className="cursor-pointer font-semibold text-ink">+ Add an event</summary>
          <form action={tourNoop} className="mt-4 grid gap-3">
            <EventFields />
            <button type="submit" className="btn-accent w-fit">
              Add to the calendar
            </button>
          </form>
        </details>
      </div>
    </div>
  );
}

/** The business page's event fields (app/business-listing/[token]/page.js). */
function EventFields({ ev = null }) {
  return (
    <>
      <div>
        <label className="label">Event name</label>
        <input name="title" required defaultValue={ev?.title || ""} placeholder="Book signing with Abigail Morgan" className="field" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label">Date</label>
          <input type="date" name="date" required defaultValue={ev?.date || ""} className="field" />
        </div>
        <div>
          <label className="label">Starts</label>
          <input type="time" name="public_time" defaultValue={ev?.public_time || ""} className="field" />
        </div>
        <div>
          <label className="label">Ends (optional)</label>
          <input type="time" name="public_end_time" defaultValue={ev?.public_end_time || ""} className="field" />
        </div>
      </div>
      <div>
        <label className="label">What is it?</label>
        <textarea
          name="description"
          rows={3}
          defaultValue={ev?.description || ""}
          placeholder="Abigail's signing copies of the anniversary edition from 6pm — first come, first served."
          className="field"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Cost (optional)</label>
          <input name="price" defaultValue={ev?.price || ""} placeholder="Free · $10 · $25" className="field" />
        </div>
        <div>
          <label className="label">Flyer or photo (optional)</label>
          <input type="file" name="photo" accept="image/*" className="block w-full text-sm" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Link label (optional)</label>
          <input name="link_label" defaultValue="" placeholder="Reserve a copy" className="field" />
        </div>
        <div>
          <label className="label">Link (optional)</label>
          <input name="link_url" defaultValue="" placeholder="yourshop.com/events" className="field" />
        </div>
      </div>
    </>
  );
}

// ------------------------------------------------------------ exhibitor

export function TourExhibitor({ m }) {
  return (
    <div>
      <PortalHead eyebrow="Your private exhibitor link" title="Set up your page">
        Your spot on The Alley&apos;s Exhibitors page: your bio, a profile photo and photos of your work. Changes go live on
        our website right away.
      </PortalHead>
      <SignedIn m={m} />

      <div style={{ marginTop: 36 }}>
        <ExhibitorEditForm
          exhibitor={{
            name: "Mara Lindqvist",
            discipline: "Oil painting",
            blurb:
              "Mara paints the Cache Valley in thick, bright oils: barns after rain, the canyon in October, Center Street at dusk. This show gathers twelve new small works made over the past year.",
            active_until: day(120),
            profile_photo: "",
            works: [],
            links: [{ label: "Website", url: "https://maralindqvist.example.com" }],
          }}
          saveAction={tourNoop}
          addPhotoAction={tourNoop}
          removePhotoAction={tourNoop}
        />
      </div>
    </div>
  );
}

// ------------------------------------------------------------ maker

const DROPOFF_STATUS = {
  submitted: { tone: "warning", label: "waiting to come in" },
  accepted: { tone: "success", label: "received" },
};

function Stat({ label, value, hint }) {
  return (
    <div className="card ac-figure" style={{ padding: "18px 20px" }}>
      <b className="tabular-nums">{value}</b>
      <span>{label}</span>
      {hint ? <p className="ac-small" style={{ margin: "4px 0 0" }}>{hint}</p> : null}
    </div>
  );
}

function SalesTable({ lines }) {
  if (!lines.length) return <p className="mt-2 text-sm text-ink-muted">Nothing yet.</p>;
  return (
    <div className="-mx-1 mt-2 overflow-x-auto px-1">
      <table className="w-full min-w-[420px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-muted">
            <th className="py-1.5 pr-2">Day</th>
            <th className="py-1.5 pr-2">Item</th>
            <th className="py-1.5 pr-2 text-right">Qty</th>
            <th className="py-1.5 pr-2 text-right">Sold for</th>
            <th className="py-1.5 text-right">Yours</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-b border-line/60">
              <td className="py-1.5 pr-2 whitespace-nowrap text-ink-soft">{formatDateShort(l.day)}</td>
              <td className="py-1.5 pr-2 text-ink">{l.name}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{l.qty}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{formatMoney(l.net)}</td>
              <td className="py-1.5 text-right font-semibold tabular-nums">{formatMoney(l.share)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Sample shop for Wild Oat Candles, matching the tour's maker numbers (20 on the shelf, $110.06 this month, $235.20 paid). */
function makerSample() {
  const today = venueToday();
  const monthStart = `${today.slice(0, 8)}01`;
  const lastMonthEnd = shiftDate(monthStart, { days: -1 });
  const thisMonth = (k) => {
    const d = shiftDate(today, { days: -k });
    return d < monthStart ? monthStart : d;
  };
  const lastMonth = (k) => shiftDate(monthStart, { days: -k });
  const r2 = (n) => Math.round(n * 100) / 100;
  const line = (id, dayYmd, name, qty, net) => ({ id, day: dayYmd, name, qty, net, share: r2(net * 0.6) });

  const items = [
    { id: 1, name: "Juniper & Sage, 8 oz", price: 24, left: 4, sold: 11, since: shiftDate(today, { days: -64 }) },
    { id: 2, name: "Cedar Smoke, 8 oz", price: 28, left: 3, sold: 8, since: shiftDate(today, { days: -64 }) },
    { id: 3, name: "Honey Oat, 6 oz", price: 22, left: 5, sold: 6, since: shiftDate(today, { days: -40 }) },
    { id: 4, name: "Lavender Field, 8 oz", price: 24, left: 2, sold: 9, since: shiftDate(today, { days: -64 }) },
    { id: 5, name: "Fireside travel tin", price: 14, left: 4, sold: 10, since: shiftDate(today, { days: -40 }) },
    { id: 6, name: "Wild Oat taper set", price: 18, left: 2, sold: 6, since: shiftDate(today, { days: -21 }) },
  ];
  // Sold for 183.43 → 110.06 yours at 60%.
  const salesThisMonth = [
    line(11, thisMonth(1), "Juniper & Sage, 8 oz", 2, 48),
    line(12, thisMonth(2), "Cedar Smoke, 8 oz", 1, 28),
    line(13, thisMonth(4), "Lavender Field, 8 oz", 1, 24),
    line(14, thisMonth(6), "Lavender Field, 8 oz", 1, 24),
    line(15, thisMonth(8), "Cedar Smoke, 8 oz", 1, 28),
    line(16, thisMonth(10), "Fireside travel tin", 1, 14),
    line(17, thisMonth(12), "Wild Oat taper set", 1, 17.43),
  ];
  // Sold for 392.00 → 235.20 yours, paid early this month.
  const salesLastMonth = [
    line(1, lastMonth(3), "Juniper & Sage, 8 oz", 2, 48),
    line(2, lastMonth(6), "Cedar Smoke, 8 oz", 2, 56),
    line(3, lastMonth(9), "Wild Oat taper set", 3, 54),
    line(4, lastMonth(11), "Honey Oat, 6 oz", 3, 66),
    line(5, lastMonth(14), "Fireside travel tin", 4, 56),
    line(6, lastMonth(18), "Juniper & Sage, 8 oz", 2, 48),
    line(7, lastMonth(21), "Cedar Smoke, 8 oz", 1, 28),
    line(8, lastMonth(25), "Wild Oat taper set", 2, 36),
  ];
  const payouts = [
    { id: 2, paid_on: shiftDate(monthStart, { days: 2 }) <= today ? shiftDate(monthStart, { days: 2 }) : today, through: lastMonthEnd, method: "Venmo @willa-oates", amount: 235.2 },
    { id: 1, paid_on: shiftDate(monthStart, { months: -1, days: 2 }), through: shiftDate(shiftDate(monthStart, { months: -1 }), { days: -1 }), method: "Venmo @willa-oates", amount: 207 },
  ];
  const dropoffs = [
    { id: 2, created_at: day(-2), units: 12, value: 288, status: "submitted" },
    { id: 1, created_at: shiftDate(today, { days: -21 }), units: 8, value: 144, status: "accepted" },
  ];
  return { items, salesThisMonth, salesLastMonth, payouts, dropoffs, lastMonthEnd };
}

/**
 * The same shop's "How it's selling", worked out from the sample above: the
 * three 8 oz scents in one group, with a cost so the profit shows.
 */
function makerInsightsSample(o) {
  const r2 = (n) => Math.round(n * 100) / 100;
  const GROUP = "8 oz candle";
  const inGroup = { 1: "Juniper & Sage", 2: "Cedar Smoke", 4: "Lavender Field" };
  const items = o.items.map((i) => ({
    id: i.id,
    name: i.name,
    short: inGroup[i.id] || i.name,
    group: inGroup[i.id] ? GROUP : null,
    price: i.price,
    cost: inGroup[i.id] ? 7.5 : null,
    left: i.left,
    active: true,
  }));
  const idOf = Object.fromEntries(o.items.map((i) => [i.name, i.id]));
  const tallyLines = (lines) => {
    const byItem = {};
    for (const l of lines) {
      const b = (byItem[idOf[l.name]] ||= { qty: 0, net: 0, share: 0 });
      b.qty += l.qty;
      b.net = r2(b.net + l.net);
      b.share = r2(b.share + l.share);
    }
    return byItem;
  };
  const all = Object.fromEntries(o.items.map((i) => [i.id, { qty: i.sold, net: i.sold * i.price, share: r2(i.sold * i.price * 0.6) }]));
  const share = (lines) => r2(lines.reduce((t, l) => t + l.share, 0));
  const qty = (lines) => lines.reduce((t, l) => t + l.qty, 0);
  const thisMonth = `${venueToday().slice(0, 8)}01`;
  const months = Array.from({ length: 12 }, (_, k) => {
    const start = shiftDate(thisMonth, { months: k - 11 });
    const label = new Date(`${start}T12:00:00`).toLocaleDateString("en-US", { month: "short" });
    if (k === 11) return { ym: start.slice(0, 7), label, qty: qty(o.salesThisMonth), share: share(o.salesThisMonth) };
    if (k === 10) return { ym: start.slice(0, 7), label, qty: qty(o.salesLastMonth), share: share(o.salesLastMonth) };
    if (k === 9) return { ym: start.slice(0, 7), label, qty: 14, share: 207 };
    return { ym: start.slice(0, 7), label, qty: 0, share: 0 };
  });
  return {
    items,
    periods: [
      { key: "month", label: "This month", byItem: tallyLines(o.salesThisMonth) },
      { key: "last", label: "Last month", byItem: tallyLines(o.salesLastMonth) },
      { key: "year", label: "This year", byItem: all },
      { key: "all", label: "All time", byItem: all },
    ],
    months,
    groups: [{ name: GROUP, price: 24 }],
  };
}

export function TourConsign({ m }) {
  const o = makerSample();
  const insights = makerInsightsSample(o);
  const stats = m.makerStats?.[1] || { onShelf: 20, soFarThisMonth: 110.06, due: 235.2 };
  const monthName = new Date(`${o.lastMonthEnd}T12:00:00`).toLocaleDateString("en-US", { month: "long" });
  const thisYear = venueToday().slice(0, 4);
  const sum = (lines) => lines.reduce((t, l) => t + l.share, 0);
  const hidden = { vendor_id: "1" };

  return (
    <>
      <a href={tourHref(m.key)} className="ac-rulelink ac-rise">Your account</a>
      <div style={{ marginTop: 26 }}>
        <div className="ac-maker space-y-6">
          <header className="ac-hello" style={{ marginBottom: 8 }}>
            <p className="ac-eyebrow ac-date ac-rise">Consignment</p>
            <h1 className="ac-title ac-rise ac-rise-1">Wild Oat Candles</h1>
            <p className="ac-lede ac-rise ac-rise-2">
              You get 60% of every sale, paid monthly for the month before. Sales updated{" "}
              {formatDateShort(venueToday())}, 6:00 AM.
            </p>
          </header>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="On the shelf" value={stats.onShelf} hint={`${o.items.length} products`} />
            <Stat label="This month so far" value={formatMoney(stats.soFarThisMonth)} hint="your share" />
            <Stat label={`${monthName} payout`} value={formatMoney(stats.due)} hint={`paid ${formatDateShort(o.payouts[0].paid_on)}`} />
            <Stat
              label="Paid this year"
              value={formatMoney(o.payouts.filter((p) => p.paid_on.slice(0, 4) === thisYear).reduce((t, p) => t + p.amount, 0))}
            />
          </div>

          <Card pad="lg" id="selling">
            <h2 className="ac-h2">How it&apos;s selling</h2>
            <SalesInsights items={insights.items} periods={insights.periods} months={insights.months} whose="your" showCost />
          </Card>

          <Card pad="lg" id="dropoffs">
            <h2 className="ac-h2">Bringing something in?</h2>
            <p className="mt-1 text-sm text-ink-soft">
              List it here first. When you come in we count it together, put it in the register and print the price tags.
            </p>
            <div className="mt-4">
              <DropoffForm items={o.items.map((i) => ({ id: i.id, name: i.name, price: i.price }))} groups={insights.groups} hidden={hidden} />
            </div>
            <ul className="mt-5 divide-y divide-line border-t border-line text-sm">
              {o.dropoffs.map((d) => {
                const st = DROPOFF_STATUS[d.status];
                return (
                  <li key={d.id} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="font-semibold text-ink">{formatDateShort(d.created_at)}</span>
                    <span className="text-ink-muted">
                      {d.units} items · {formatMoney(d.value)}
                    </span>
                    <Badge tone={st.tone}>{st.label}</Badge>
                    {d.status === "submitted" ? (
                      <form action={tourNoop} className="ml-auto">
                        <input type="hidden" name="id" value={d.id} />
                        <button className="text-xs font-semibold text-rust hover:underline">Cancel</button>
                      </form>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card pad="lg">
            <h2 className="ac-h2">On the shelf</h2>
            <div className="-mx-1 mt-2 overflow-x-auto px-1">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-muted">
                    <th className="py-1.5 pr-2">Item</th>
                    <th className="py-1.5 pr-2 text-right">Price</th>
                    <th className="py-1.5 pr-2 text-right">Left</th>
                    <th className="py-1.5 pr-2 text-right">Sold</th>
                    <th className="py-1.5 text-right">Since</th>
                  </tr>
                </thead>
                <tbody>
                  {o.items.map((i) => (
                    <tr key={i.id} className="border-b border-line/60">
                      <td className="py-1.5 pr-2 text-ink">{i.name}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{formatMoney(i.price)}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{i.left}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{i.sold}</td>
                      <td className="py-1.5 text-right whitespace-nowrap text-ink-soft">{formatDateShort(i.since)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card pad="lg">
            <h2 className="ac-h2">
              Sold this month <span className="font-normal text-ink-muted">· {formatMoney(sum(o.salesThisMonth))} yours</span>
            </h2>
            <SalesTable lines={o.salesThisMonth} />
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-semibold text-ink-muted">
                Last month · {formatMoney(sum(o.salesLastMonth))} yours
              </summary>
              <SalesTable lines={o.salesLastMonth} />
            </details>
          </Card>

          <Card pad="lg">
            <h2 className="ac-h2">Payouts</h2>
            <ul className="mt-2 divide-y divide-line text-sm">
              {o.payouts.map((p) => (
                <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                  <span className="text-ink">
                    {formatDate(p.paid_on)}
                    <span className="text-ink-muted">
                      {" "}
                      · sales through {formatDateShort(p.through)} · {p.method}
                    </span>
                  </span>
                  <span className="font-semibold tabular-nums text-ink">{formatMoney(p.amount)}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card pad="lg" id="details">
            <h2 className="ac-h2">Your details</h2>
            <form action={tourNoop} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Your name</label>
                <input name="contact_name" defaultValue="Willa Oates" className="field" />
              </div>
              <div>
                <label className="label">Phone</label>
                <input name="phone" type="tel" defaultValue="(435) 555-0142" className="field" />
              </div>
              <div className="sm:col-span-2">
                <PayoutMethodField defaultValue="Venmo · @willa-oates" id="tour-pay" />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" variant="ghost">Save</Button>
                <p className="mt-2 text-xs text-ink-muted">
                  To change your email ({m.account?.email || "willa@example.com"}) or your share, ask us. You agreed to the
                  terms on {formatDateShort(shiftDate(venueToday(), { days: -64 }))}.
                </p>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}

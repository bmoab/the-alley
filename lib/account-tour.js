import { venueToday, shiftDate, formatDateShort } from "./constants.js";
import { sortActivity } from "./activity-feed.js";

/**
 * The account tour (Admin → Account tour): sample people, one per kind of
 * customer, and what to tell someone who asks about their account. Nothing
 * here touches the database — the account page is drawn from these objects.
 */

/** A sample email's body: plain paragraphs, an optional button. */
function letter(name, paras, button) {
  const p = paras.map((t) => `<p>${t}</p>`).join("");
  const b = button
    ? `<p><a href="#" style="display:inline-block;background:#b08433;color:#fff;text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:600;font-size:15px">${button}</a></p>`
    : "";
  return `<p>Hi ${name},</p>${p}${b}`;
}

/** A page of the tour, as the preview frame's address. */
export function tourHref(mode, page = "home", id = null) {
  return `/admin/tour-frame?as=${mode}${page && page !== "home" ? `&page=${page}` : ""}${id != null ? `&id=${id}` : ""}`;
}

const none = { bookings: { total: 0, upcoming: 0, portalToken: null }, listings: [], businesses: [], exhibitors: [], makers: [] };

/** "N days from today" as YYYY-MM-DD. */
const day = (n) => shiftDate(venueToday(), { days: n });
/** A sent_at stamp n days ago, mid-morning Utah time. */
const sent = (n) => `${day(-n)} 16:30:00`;
/** An Activity time n days ago, Utah time. */
const at = (n, time = "10:30") => `${day(-n)} ${time}`;

function monthName(offset) {
  const [y, m] = venueToday().split("-").map(Number);
  return new Date(y, m - 1 + offset, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/** This week and next, Sunday–Saturday, with a made-up rota (closed Sundays). */
function sampleSchedule() {
  const today = venueToday();
  const left = 7 - new Date(`${today}T12:00:00`).getDay();
  // By weekday, Monday first.
  const ROTA = {
    1: [["Chelsea", "10:00", "16:00"], ["Maya", "12:00", "18:00"]],
    2: [["Chelsea", "09:00", "15:00"], ["Jonah", "15:00", "20:00"]],
    3: [["Maya", "10:00", "17:00"], ["Jonah", "13:00", "20:00"]],
    4: [["Chelsea", "10:00", "16:00"], ["Maya", "14:00", "20:00"]],
    5: [["Chelsea", "10:00", "18:00"], ["Maya", "12:00", "18:00"], ["Jonah", "16:00", "21:00"]],
    6: [["Maya", "10:00", "16:00"], ["Jonah", "12:00", "19:00"]],
  };
  const days = Array.from({ length: left + 7 }, (_, i) => {
    const date = shiftDate(today, { days: i });
    const rota = ROTA[new Date(`${date}T12:00:00`).getDay()] || [];
    return { date, shifts: rota.map(([name, start, end]) => ({ name, start, end })) };
  });
  return { ok: true, weeks: [days.slice(0, left), days.slice(left)] };
}

const ANY = [
  {
    q: "I made an account but it's empty.",
    a: "Their things are matched by email. They signed up with a different address from the one on their booking, listing or business. Either they make an account with that email, or we change the email on their record (Directory, Makers, Exhibitors or the booking) to the one they signed up with.",
  },
  {
    q: "Do I have to make an account?",
    a: "No. The private links we email keep working. The account just gathers everything in one place behind one sign-in, with a copy of every email.",
  },
  {
    q: "Where's my receipt / that email?",
    a: "Activity, at the top of their account. Every payment is there with the card it was paid with (last four only), the receipt and the invoice, and every email we send them is kept there too. They can search it or narrow it to Payments or Emails and a date range.",
  },
];

export const TOUR = [
  {
    key: "new",
    label: "Just signed up",
    blurb: "Someone who made an account before booking or selling anything.",
    account: { name: "Alex Rivera", email: "alex@example.com" },
    mine: none,
    inbox: [],
    sees: [
      "A welcome panel saying nothing's here yet, and the email it's all matched on.",
      "“Everything you can do here”: booking a room, listing an event, selling in the shop, showing art, being a tenant, and Activity. Each one opens to a short how-it-works.",
    ],
    questions: ANY,
  },
  {
    key: "renter",
    label: "Rents a room",
    blurb: "Someone who books the Loft or the Conference Room.",
    account: { name: "Riley Nguyen", email: "riley@example.com" },
    mine: { ...none, bookings: { total: 3, upcoming: 2, portalToken: "tour" } },
    inbox: [
      {
        id: 1,
        subject: "You're booked — The Alley Loft",
        sent_at: sent(2),
        body: letter("Riley", ["You're all set. Your booking for The Alley Loft is confirmed.", "You can see it, pay what's left, or change the date any time from your bookings page."], "See your bookings"),
      },
      {
        id: 2,
        subject: "Invoice for your booking",
        sent_at: sent(2),
        body: letter("Riley", ["Here's the invoice for your Loft booking. The deposit holds your date; the rest is due before the event."], "Pay the invoice"),
      },
      {
        id: 3,
        subject: "We got your request",
        sent_at: sent(4),
        body: letter("Riley", ["Thanks for asking about the Loft. We'll look at the date and get back to you within a day or two."]),
      },
    ],
    events: [
      { key: "r1", at: at(4, "19:42"), type: "booking", title: "Asked for the Loft", sub: `${formatDateShort(day(18))} · 6:00 PM–9:00 PM`, details: [["Event", "Riley's birthday dinner"], ["Guests", "20–30"], ["Room", "$100.00 an hour × 3 hours"], ["Refundable deposit", "$150.00"]] },
      { key: "r2", at: at(2, "09:05"), type: "booking", title: "Approved — your date is held", sub: "The Alley Loft", details: [["To pay", "$450.00"]] },
      {
        key: "r3",
        at: at(2, "13:18"),
        type: "payment",
        also: ["booking"],
        title: "Paid for the Loft",
        sub: "The Alley Loft",
        amount: 450,
        flow: "out",
        details: [["Room", "$300.00"], ["Refundable deposit", "$150.00"], ["Paid with", "Visa •••• 4242"], ["Receipt", "#7mQx"], ["Invoice", "#000142"]],
        links: [{ label: "Receipt", href: "#t-receipt" }, { label: "Invoice", href: "#t-invoice" }],
      },
      { key: "r4", at: at(41, "18:00"), type: "booking", title: "Your time in the Conference Room", sub: "6:00 PM–8:00 PM · Book club" },
      {
        key: "r5",
        at: at(38, "11:20"),
        type: "payment",
        also: ["booking"],
        title: "Deposit returned",
        sub: "Conference Room",
        amount: 150,
        flow: "in",
        details: [["Returned", "$150.00"], ["Back to", "Visa •••• 4242"]],
      },
    ],
    sees: [
      "Your bookings: how many are coming up. Tapping it opens every booking with the room, the date, what's owed, a Pay button and Change my date.",
      "Latest activity: their newest bookings, payments and emails. Activity at the top has all of it, with the card each payment was made with and its receipt.",
    ],
    questions: [
      {
        q: "How do I change my date?",
        a: "Your bookings → Change my date. They pick a new open date themselves. If the button isn't there, the booking is too close to move online and they should call or email us.",
      },
      {
        q: "Did my payment go through?",
        a: "Activity → Payments: each payment with the card it was paid with (last four), the amount, and buttons for Square's receipt and the invoice. Your bookings shows what's still owed.",
      },
      ...ANY.slice(0, 1),
    ],
  },
  {
    key: "host",
    label: "Hosts an event",
    blurb: "Someone putting an event on our public calendar: a renter, a partner or a performer.",
    account: { name: "Sam Ortega", email: "sam@example.com" },
    mine: {
      ...none,
      bookings: { total: 2, upcoming: 2, portalToken: "tour" },
      listings: [
        { id: 1, title: "Saturday Improv Night", date: day(12), status: "live", host_token: "tour" },
        { id: 2, title: "Spring Pottery Class", date: day(40), status: "pending", host_token: "tour" },
        { id: 3, title: "", date: null, status: "draft", host_token: "tour" },
      ],
    },
    inbox: [
      {
        id: 1,
        subject: "Your event is on the calendar",
        sent_at: sent(1),
        body: letter("Sam", ["Saturday Improv Night is now on our public calendar. Changes you make on its page show up right away."], "See your event"),
      },
      {
        id: 2,
        subject: "Post your event on our calendar",
        sent_at: sent(6),
        body: letter("Sam", ["Want guests to find your event? Use your private link to add a title, a flyer, times and how people pay. We'll take a quick look and put it on the calendar."], "Post your event"),
      },
    ],
    events: [
      { key: "h1", at: at(3, "21:10"), type: "listing", title: "Sent “Saturday Improv Night” in for our calendar", sub: formatDateShort(day(12)), links: [{ label: "Its page", href: "#t-listing" }] },
      { key: "h2", at: at(1, "08:45"), type: "listing", title: "“Saturday Improv Night” is on our public calendar", sub: formatDateShort(day(12)), links: [{ label: "Its page", href: "#t-listing" }] },
    ],
    sees: [
      "Your events: each listing with where it stands. “On the calendar” is public. “In review” is waiting for us to approve it. “Not finished” means they haven't filled it in yet.",
      "Tapping one opens its page: title, description, flyer, times, and how guests pay.",
      "Their bookings, if the event is in a room they rented.",
    ],
    questions: [
      {
        q: "Why isn't my event on the calendar yet?",
        a: "If it says In review, we approve it in Events (it shows under “Review” at the top). If it says Not finished, they still need to fill it in from its page.",
      },
      { q: "Can I change it after it's posted?", a: "Yes. Changes on their event's page show on the calendar right away." },
      ...ANY.slice(0, 1),
    ],
  },
  {
    key: "tenant",
    label: "Tenant",
    blurb: "A business in the building. This one shares the shop staff, so they also see the schedule.",
    account: { name: "Lena Ortiz", email: "lena@example.com" },
    mine: {
      ...none,
      businesses: [{ id: 1, business_name: "Lucid Hair Collective", token: "tour" }],
      listings: [{ id: 4, title: "Free bang trims", date: day(9), status: "live", host_token: "tour" }],
    },
    bills: {
      1: {
        rent: { amount: 1200, link: "#t-payrent" },
        unpaid: [{ id: 2, label: `Shared staff cost — ${monthName(-1)}`, amount: 166.67, payment_link: "#t-pay", sent_at: sent(3) }],
        paid: [{ id: 1, label: `Shared staff cost — ${monthName(-2)}`, amount: 158.33 }],
      },
    },
    schedule: true,
    inbox: [
      {
        id: 1,
        subject: `Shared staff cost — ${monthName(-1)}: $166.67`,
        sent_at: sent(3),
        body: letter("Lena", [`Your share of the shop staff for ${monthName(-1)} is <strong>$166.67</strong>. It's also on your account with a Pay button.`], "Pay $166.67"),
      },
      {
        id: 2,
        subject: "Your new Alley account — everything in one place",
        sent_at: sent(8),
        body: letter("Lena", ["Your business page, your rent and every email we send you now live in one place: your Alley account.", "Sign up with this email address and it's all there."], "Create your account"),
      },
    ],
    events: [
      {
        key: "t1",
        at: at(3, "09:00"),
        type: "payment",
        title: `Bill: Shared staff cost — ${monthName(-1)}`,
        amount: 166.67,
        details: [["Status", "Not paid yet"]],
        links: [{ label: "Pay it", href: "#t-pay" }],
      },
      {
        key: "t2",
        at: at(30, "12:14"),
        type: "payment",
        title: `Paid: Shared staff cost — ${monthName(-2)}`,
        amount: 158.33,
        flow: "out",
        details: [["Paid with", "Mastercard •••• 5100"], ["Receipt", "#4kTz"]],
        links: [{ label: "Receipt", href: "#t-receipt" }, { label: "Invoice", href: "#t-invoice" }],
      },
      { key: "t3", at: day(-25), type: "payment", title: `Rent for ${monthName(0)} received`, amount: 1200, flow: "out" },
    ],
    sees: [
      "Bills: monthly rent with a Pay rent button, and their share of the staff cost each month with a Pay button until it's paid.",
      "Who's working: the staff schedule for this week and next, straight from Square. Only tenants marked “Shares staff” see it.",
      "Your business: their directory page (description, photos, links) and the events they post.",
      "The Alley calendar: one tap to subscribe on iPhone/Mac or in Google Calendar, so every Alley event shows in their own calendar.",
    ],
    questions: [
      {
        q: "There's no Pay rent button.",
        a: "Their pay link isn't set yet. Directory → their business → Rent → Edit, and paste the Square link.",
      },
      {
        q: "I can't see who's working.",
        a: "Only tenants ticked in Shop → Shared staff cost see it, and only shifts that are published in Square show up.",
      },
      { q: "How do I change my directory page?", a: "Your business → Edit. Their changes go live right away." },
      {
        q: "How do I get The Alley's events in my calendar?",
        a: "On their account (or business page), “Put our events on your phone”: iPhone or Mac, Google Calendar, or Copy the link for anything else. It keeps itself up to date.",
      },
      ...ANY.slice(0, 1),
    ],
  },
  {
    key: "maker",
    label: "Sells in the shop",
    blurb: "A maker selling handmade goods on consignment.",
    account: { name: "Willa Oates", email: "willa@example.com" },
    mine: { ...none, makers: [{ id: 1, name: "Wild Oat Candles" }] },
    makerStats: { 1: { onShelf: 20, soFarThisMonth: 110.06, due: 235.2, waiting: true } },
    inbox: [
      {
        id: 1,
        subject: `Your ${monthName(-1)} payout — $235.20`,
        sent_at: sent(1),
        body: letter("Willa", [`We've paid you <strong>$235.20</strong> for what sold in ${monthName(-1)}. Every sale is listed on your shop page.`], "See your sales"),
      },
      {
        id: 2,
        subject: "Your drop-off was counted in",
        sent_at: sent(12),
        body: letter("Willa", ["We counted in your drop-off together and it's on the shelf. Tags are printed and everything's in Square."]),
      },
    ],
    events: [
      { key: "m1", at: at(60, "15:02"), type: "terms", title: "Agreed to the consignment terms at 60%", details: [["", "Signed “Willa Oates”"]], links: [{ label: "Read what you agreed to", href: "#t-consign" }] },
      {
        key: "m2",
        at: at(12, "11:30"),
        type: "stock",
        title: "12 items counted in, $336.00 at full price (sheet #12)",
        details: [["Counted in by", "Chelsea"]],
        lines: [
          { name: "Lavender candle — 8 oz", qty: 6, amount: 28, each: true },
          { name: "Cedar candle — 8 oz", qty: 6, amount: 28, each: true },
        ],
        links: [{ label: "Your shop page", href: "#t-consign" }],
      },
      { key: "m3", at: at(11, "20:16"), type: "stock", title: "Confirmed the count on sheet #12", details: [["", "Signed “Willa Oates”"]] },
      {
        key: "m4",
        at: at(6, "14:22"),
        type: "sale",
        title: "Sold: Lavender candle — 8 oz",
        amount: 16.8,
        flow: "in",
        details: [["Sold for", "$28.00"], ["Your share (60%)", "$16.80"], ["Paid out", "Not yet"]],
      },
      {
        key: "m5",
        at: at(4, "17:40"),
        type: "sale",
        title: "Sold 3 items",
        amount: 50.4,
        flow: "in",
        details: [["Sold for", "$84.00"], ["Your share (60%)", "$50.40"], ["Paid out", "Not yet"]],
        lines: [
          { name: "Cedar candle — 8 oz", qty: 2, amount: 56 },
          { name: "Lavender candle — 8 oz", qty: 1, amount: 28 },
        ],
      },
      {
        key: "m6",
        at: at(1, "10:05"),
        type: "payout",
        title: "We paid you",
        amount: 235.2,
        flow: "in",
        details: [["For sales through", monthName(-1)], ["Sold", "14 sales, $392.00 after discounts"], ["Paid by", "Venmo · @willa-oates"], ["Reference", "4185 2290 1173"]],
        links: [{ label: "Your shop page", href: "#t-consign" }],
      },
    ],
    sees: [
      "Their shop: how many items are on the shelf, what they've earned so far this month, and the payout that's coming.",
      "A note when they have a drop-off listed that we haven't counted in yet.",
      "Tapping it opens what's on the shelf, every sale, payouts, their details, and “Bringing something in?” to list a drop-off.",
      "“How it's selling”: their best sellers this month, last month, this year or all time, by group (8 oz candle → each scent) and item by item, and their share month by month.",
    ],
    questions: [
      {
        q: "Can I see which scents sell best?",
        a: "Yes. Under “Sort into groups and add your costs” they put items in groups (say Large Candle, with each scent inside). How it's selling then ranks the groups and the scents in each. Optional, and nothing changes in Square.",
      },
      {
        q: "Can I see my profit?",
        a: "If they add what a piece costs them to make (same place, optional), How it's selling shows their profit: their share minus their cost. Only they see their costs; it doesn't change what they're paid.",
      },
      {
        q: "When do I get paid?",
        a: "Early each month, for everything that sold the month before. The payout coming is the amount for last month.",
      },
      {
        q: "How do I bring new things in?",
        a: "On their shop page, “Bringing something in?” lists a drop-off first. Then they bring it in, we count it with them and it goes on the shelf.",
      },
      ...ANY.slice(0, 1),
    ],
  },
  {
    key: "artist",
    label: "Gallery artist",
    blurb: "An artist with a page on our Exhibitors list.",
    account: { name: "Mara Lindqvist", email: "mara@example.com" },
    mine: { ...none, exhibitors: [{ id: 1, name: "Mara Lindqvist", token: "tour" }] },
    inbox: [
      {
        id: 1,
        subject: "Set up your exhibitor page",
        sent_at: sent(5),
        body: letter("Mara", ["We'd love to feature your work in The Alley gallery. Use your private link to add your bio, a portrait and photos of your work."], "Set up your exhibitor page"),
      },
    ],
    sees: [
      "Gallery: their exhibitor page, with Edit to change their bio, portrait and photos of their work.",
      "If they also sell in the shop, their shop tile shows up here too.",
    ],
    questions: [
      { q: "How do I change my photos?", a: "Gallery → Edit. Changes show on the Exhibitors page right away." },
      {
        q: "When does my show end?",
        a: "It's the agreement end date on their exhibitor record. We send a reminder a month and a week before.",
      },
      ...ANY.slice(0, 1),
    ],
  },
];

/** A sample person's Activity: their account, their emails, and what's happened. */
function sampleActivity(m) {
  const made = { key: "acct", at: at(m.inbox.length ? 70 : 0, "09:12"), type: "account", title: "Made your Alley account", sub: m.account.email };
  const mail = m.inbox.map((e) => ({ key: `mail-${e.id}`, at: `${e.sent_at.slice(0, 10)} 10:30`, type: "email", title: e.subject, sub: "Emailed to you", emailId: e.id }));
  return sortActivity([made, ...mail, ...(m.events || [])]);
}

export function tourMode(key) {
  const m = TOUR.find((t) => t.key === key) || TOUR[0];
  return { ...m, schedule: m.schedule ? sampleSchedule() : null, activity: sampleActivity(m) };
}

/** What a tap does in the real account, shown instead of going anywhere. */
export const TOUR_LINKS = {
  bookings: "Opens their bookings: every booking with its room, date and what's owed, a Pay button, and Change my date.",
  listing: "Opens the event's page, where they write the title, description, flyer, times and how guests pay.",
  business: "Opens their business page: description, photos, category and links for the directory, their bills, and events they post.",
  exhibitor: "Opens their gallery page: bio, portrait and photos of their work. Changes show on the Exhibitors page right away.",
  consign: "Opens their shop page: what's on the shelf, every sale, payouts, their details, and “Bringing something in?” to list a drop-off.",
  activity: "Opens their Activity: everything that's happened on their account, with every email we've sent them.",
  receipt: "Opens Square's receipt for that payment.",
  invoice: "Opens the Square invoice, marked paid.",
  email: "Opens that email, exactly as we sent it.",
  payrent: "Opens the Square payment page for their rent.",
  pay: "Opens the Square payment page for that bill.",
  reschedule: "Opens a calendar of open dates, where they pick a new one for their booking.",
  settings: "Opens Settings: their name, a password if they want one, and signing out.",
  home: "This page.",
};

import { venueToday, shiftDate } from "./constants.js";

/**
 * The account tour (Admin → Account tour): sample people, one per kind of
 * customer, and what to tell someone who asks about their account. Nothing
 * here touches the database — the account page is drawn from these objects.
 */

const none = { bookings: { total: 0, upcoming: 0, portalToken: null }, listings: [], businesses: [], exhibitors: [], makers: [] };

/** "N days from today" as YYYY-MM-DD. */
const day = (n) => shiftDate(venueToday(), { days: n });
/** A sent_at stamp n days ago, mid-morning Utah time. */
const sent = (n) => `${day(-n)} 16:30:00`;

function monthName(offset) {
  const [y, m] = venueToday().split("-").map(Number);
  return new Date(y, m - 1 + offset, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/** This week and next, Sunday–Saturday, with a made-up rota. */
function sampleSchedule() {
  const today = venueToday();
  const left = 7 - new Date(`${today}T12:00:00`).getDay();
  const team = [
    ["Chelsea", "10:00", "16:00"],
    ["Maya", "12:00", "18:00"],
    ["Jonah", "16:00", "20:00"],
  ];
  const days = Array.from({ length: left + 7 }, (_, i) => {
    const date = shiftDate(today, { days: i });
    const sunday = new Date(`${date}T12:00:00`).getDay() === 0;
    return { date, shifts: sunday ? [] : team.filter((_, j) => (i + j) % 3 !== 2).map(([name, start, end]) => ({ name, start, end })) };
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
    a: "Inbox, at the top of their account. Every email we send them is kept there.",
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
      "“Everything you can do here”: booking a room, listing an event, selling in the shop, showing art, being a tenant, and the inbox. Each one opens to a short how-it-works.",
    ],
    questions: ANY,
  },
  {
    key: "renter",
    label: "Rents a room",
    blurb: "Someone who books the Main Floor, the Loft or the Conference Room.",
    account: { name: "Riley Nguyen", email: "riley@example.com" },
    mine: { ...none, bookings: { total: 3, upcoming: 2, portalToken: "tour" } },
    inbox: [
      { id: 1, subject: "You're booked — The Alley Loft", sent_at: sent(2) },
      { id: 2, subject: "Invoice for your booking", sent_at: sent(2) },
      { id: 3, subject: "We got your request", sent_at: sent(4) },
    ],
    sees: [
      "Your bookings: how many are coming up. Tapping it opens every booking with the room, the date, what's owed, a Pay button and Change my date.",
      "Their latest emails from us, newest first.",
    ],
    questions: [
      {
        q: "How do I change my date?",
        a: "Your bookings → Change my date. They pick a new open date themselves. If the button isn't there, the booking is too close to move online and they should call or email us.",
      },
      { q: "Did my payment go through?", a: "Your bookings shows what's paid and what's still owed, and the emails about it are in their Inbox." },
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
      bookings: { total: 1, upcoming: 1, portalToken: "tour" },
      listings: [
        { id: 1, title: "Saturday Improv Night", date: day(12), status: "live", host_token: "tour" },
        { id: 2, title: "Spring Pottery Class", date: day(40), status: "pending", host_token: "tour" },
        { id: 3, title: "", date: null, status: "draft", host_token: "tour" },
      ],
    },
    inbox: [
      { id: 1, subject: "Your event is on the calendar", sent_at: sent(1) },
      { id: 2, subject: "Post your event on our calendar", sent_at: sent(6) },
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
      { id: 1, subject: `Shared staff cost — ${monthName(-1)}: $166.67`, sent_at: sent(3) },
      { id: 2, subject: "Your new Alley account — everything in one place", sent_at: sent(8) },
    ],
    sees: [
      "Bills: monthly rent with a Pay rent button, and their share of the staff cost each month with a Pay button until it's paid.",
      "Who's working: the staff schedule for this week and next, straight from Square. Only tenants marked “Shares staff” see it.",
      "Your business: their directory page (description, photos, links) and the events they post.",
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
      ...ANY.slice(0, 1),
    ],
  },
  {
    key: "maker",
    label: "Sells in the shop",
    blurb: "A maker selling handmade goods on consignment.",
    account: { name: "Willa Oates", email: "willa@example.com" },
    mine: { ...none, makers: [{ id: 1, name: "Wild Oat Candles" }] },
    makerStats: { 1: { onShelf: 20, soFarThisMonth: 128.4, due: 274.4, waiting: true } },
    inbox: [
      { id: 1, subject: `Your ${monthName(-1)} payout — $274.40`, sent_at: sent(1) },
      { id: 2, subject: "Your drop-off was counted in", sent_at: sent(12) },
    ],
    sees: [
      "Their shop: how many items are on the shelf, what they've earned so far this month, and the payout that's coming.",
      "A note when they have a drop-off listed that we haven't counted in yet.",
      "Tapping it opens what's on the shelf, every sale, payouts, their details, and “Bringing something in?” to list a drop-off.",
    ],
    questions: [
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
    inbox: [{ id: 1, subject: "Set up your exhibitor page", sent_at: sent(5) }],
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

export function tourMode(key) {
  const m = TOUR.find((t) => t.key === key) || TOUR[0];
  return { ...m, schedule: m.schedule ? sampleSchedule() : null };
}

/** What a tap does in the real account, shown instead of going anywhere. */
export const TOUR_LINKS = {
  bookings: "Opens their bookings: every booking with its room, date and what's owed, a Pay button, and Change my date.",
  listing: "Opens the event's page, where they write the title, description, flyer, times and how guests pay.",
  business: "Opens their business page: description, photos, category and links for the directory, their bills, and events they post.",
  exhibitor: "Opens their gallery page: bio, portrait and photos of their work. Changes show on the Exhibitors page right away.",
  consign: "Opens their shop page: what's on the shelf, every sale, payouts, their details, and “Bringing something in?” to list a drop-off.",
  inbox: "Opens their inbox: a copy of every email we've sent them.",
  email: "Opens that email, exactly as we sent it.",
  payrent: "Opens the Square payment page for their rent.",
  pay: "Opens the Square payment page for that bill.",
  settings: "Opens Settings: their name, a password if they want one, and signing out.",
  home: "This page.",
};

# The Alley On Center — Website & Booking System

A single Next.js app combining (1) the public marketing website, (2) a space
reservation/booking flow with payments and deposit handling, and (3) a public
events calendar where hosts post their own classes — plus a simple admin backend
for the owner.

Built as a **prototype** for demoing to the owner (Chelsea). It runs fully
offline: Square and email have graceful fallbacks (invoices simulated, emails
logged to the console) until real keys are added.

---

## Tech stack

- **Next.js 14** (App Router) — pages, API routes, server actions, single deploy
- **SQLite** via `better-sqlite3` — file DB at `data/alley.db` (all access via
  `lib/`, structured to migrate to PostgreSQL later)
- **Tailwind CSS** — brand theme (warm ink, brass, cream/paper) with Fraunces +
  Archivo fonts
- **Auth** — email+password admin login, bcrypt + JWT httpOnly cookie
- **Square** (sandbox) via REST; **email** via Resend or SMTP/Nodemailer

---

## Run it locally

```bash
npm install
npm run dev      # → http://localhost:3000
npm run seed     # load realistic demo data (optional but recommended for a demo)
```

The SQLite database and admin account are created automatically on first run.
(Production build: `npm run build && npm start` — but don't run `build` while
`dev` is running; they share `.next/`.)

### Admin login

- URL: **http://localhost:3000/admin**
- Email: **thealleyoncenter@gmail.com**
- Password: **alley2024**

Override via `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env` before first run.

---

## Where to add API keys

Copy `.env.example` to `.env` and fill in what you have. **Nothing is required.**

| Variable | Purpose | If absent |
|---|---|---|
| `SESSION_SECRET` | Signs admin login cookies | Insecure dev default |
| `SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID` | Square sandbox invoices | Invoices simulated + logged; a demo `/pay/...` page stands in |
| `RESEND_API_KEY` *or* `SMTP_*` | Sending email | Emails logged to the console |
| `CRON_SECRET` | Protects the reminders cron endpoint | Endpoint open (fine locally) |

---

## Features (all 10 build priorities complete)

1. **Scaffold + database + admin login** — full schema, owner login, protected `/admin`.
2. **Public website + admin editing** — Home, Directory, Spaces, Gallery, About,
   Contact, Events (+ detail). Admin editors for Site Content, Directory, Gallery.
3. **Booking flow** — 4-step Request-to-Book with availability/double-booking
   prevention (cleanup buffer), live estimate, saves as a pending request.
4. **Admin Requests** — full details, live price-adjust (rate/hours/sessions/
   deposit), approve (→ hold + payment link) or deny.
5. **Square (sandbox)** — invoice with rental + deposit line items, status,
   deposit refund. Simulated + logged when no keys.
6. **Email** — all 8 templates (owner request, client received/approved/
   confirmed/denied/hold-expired, host invite, deposit reminders); console
   fallback.
7. **Payment → confirmation** — mark-paid / demo pay page confirms the booking,
   emails the client, and sends the host invite; held holds auto-expire after the
   payment window and notify the client.
8. **Public events** — host invite link → host listing form (photo + PDF upload,
   payment instructions/link) → owner moderation → public calendar (list + month
   views) + detail pages. Owner can also post The Alley's own events.
9. **Deposits** — refund queue for past events, refund (Square) / withhold, and
   day-1/2/3 reminder emails (idempotent; lazy sweep + `/api/cron/deposit-reminders`).
10. **Polish + seed data** — responsive throughout; `npm run seed` loads a full demo set.

---

## Demo walkthrough (suggested script for showing Chelsea)

Run `npm run seed` first, then:

1. **Public site** — Home shows featured events; visit **Directory**, **The
   Spaces** (rates + rental agreement PDF), **Gallery**, **Events** (toggle
   list/calendar), and open an event to see a host's payment info.
2. **Book a space** — `/book`: pick a space, a date, and a time. Point out that
   already-booked slots are disabled. Finish the 4 steps and submit — note "no
   charge yet".
3. **Admin → Requests** — log in at `/admin`. Open the new request. Show the
   live price editor (e.g. drop the recurring **Priya yoga** request to $50/hr to
   demo the loyalty discount). Click **Approve** — a hold is placed and a payment
   link + approval email go out (watch the terminal for the email).
4. **Take payment** — open the approval email's `/pay/...` link (or use
   **Bookings → Mark as paid**). The booking flips to **confirmed**; the client
   gets a confirmation, and public-event hosts get their posting link.
5. **Host posts an event** — open the host link (printed by `npm run seed`, or
   from the email). Fill in details, upload a flyer/PDF, add a Venmo link, submit.
6. **Admin → Public Events** — approve the submitted listing; it appears on the
   public **Events** page.
7. **Admin → Deposits** — two past events are waiting. **Refund** one (Square
   refund is simulated + logged) and watch it leave the queue.
8. **Admin → Calendar / Settings / Site Content** — show non-technical editing.

---

## Project structure

```
app/
  (site)/        Public website (shared chrome) + booking flow + demo pay page
  admin/
    login/       Sign-in (unprotected)
    (dash)/      Protected admin: requests, bookings, calendar, events, deposits,
                 directory, gallery, content, settings
  host-listing/[token]/   Tokenized host event form (no account needed)
  api/           availability, upload, cron/deposit-reminders
components/      SiteHeader/Footer, BookingFlow, EventsView, RequestCard,
                 HostListingForm, Placeholder, AdminPlaceholder
lib/             db, auth, bookings, catalog, payments, square, email, deposits,
                 uploads, constants
data/            SQLite database (git-ignored)
public/uploads/  rental-agreement.pdf, host uploads, sample flyers
scripts/seed.mjs Demo data
```

---

## Notes

- The owner-provided **rental agreement** is served at
  `/uploads/rental-agreement.pdf`, linked from The Spaces page + the booking
  agreement checkbox, and attached to approval emails.
- Settings (rate, deposit, hours, cleanup buffer, payment window, listing
  auto-publish) live in the `settings` table.
- Deposit reminders: point a daily 11 AM cron at `/api/cron/deposit-reminders`
  in production (the app also sweeps lazily when the owner opens the Deposits
  page).

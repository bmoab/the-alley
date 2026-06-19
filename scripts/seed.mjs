/**
 * Demo seed data for The Alley On Center.
 *
 *   npm run seed
 *
 * Resets the content/booking tables and loads a realistic dataset for demoing
 * to the owner (build-brief section 11). Dates are relative to "today" so the
 * demo always has the right mix of upcoming, past, and to-resolve items.
 *
 * The admin account and settings/site_content defaults are left intact.
 */
import { db } from "../lib/db.js";
import { nanoid } from "nanoid";

function dayOffset(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

console.log("Seeding demo data…");

const reset = db.transaction(() => {
  // Clear demo content (keeps admin_users, settings, site_content).
  db.prepare("DELETE FROM deposit_reminders").run();
  db.prepare("DELETE FROM events").run();
  db.prepare("DELETE FROM bookings").run();
  db.prepare("DELETE FROM directory").run();
  db.prepare("DELETE FROM gallery").run();
  db.prepare("DELETE FROM exhibitor_photos").run();
  db.prepare("DELETE FROM exhibitors").run();
  db.prepare("DELETE FROM contact_messages").run();
  // Reset autoincrement counters so ids are tidy.
  db.prepare(
    "DELETE FROM sqlite_sequence WHERE name IN ('events','bookings','directory','gallery','exhibitors','exhibitor_photos')"
  ).run();

  // --- Site copy refresh (upsert; brings an existing DB current with the real
  //     Alley voice/address/socials defined in lib/db.js) ---
  const content = db.prepare(
    "INSERT INTO site_content (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  );
  Object.entries({
    home_hero_tagline: "The Alley is more than a building; it's an invitation.",
    home_hero_subtitle:
      "A space intentionally created in the heart of downtown Logan for artists, entrepreneurs, and dreamers to gather, create, and be seen.",
    home_intro:
      "The Alley is shaped by the people who show up and create here every day — a living creative ecosystem on Center Street where small businesses, artists, events, and community intersect.",
    home_cta_heading: "Bring your gathering to The Alley",
    home_cta_subtitle: "You bring the idea. We'll help with the space.",
    about_body:
      "The Alley is a living creative ecosystem located on Center Street, where small businesses, artists, events, and community intersect. It's an environment designed for collaboration, experimentation, and connection.\n\nFounded by Chelsea Funk and her daughter Caylee Funk — both lifelong Cache Valley residents — The Alley grew from a shared entrepreneurial vision into a commitment to building space for connection, creativity, and collaboration.\n\nArt is what we use to decorate space. Music is what we use to decorate time. Everything we do here lives somewhere between those two ideas.",
    contact_address: "19 W Center St., Logan, UT 84321",
    contact_email: "thealleyoncenter@gmail.com",
    contact_phone: "(435) 512-4608",
    social_instagram: "https://www.instagram.com/thealleyoncenter",
    social_facebook: "https://www.facebook.com/thealleyoncenter",
  }).forEach(([k, v]) => content.run(k, v));

  // --- Directory (tenant businesses) — mapped to floor-plan suites ---
  const dir = db.prepare(
    "INSERT INTO directory (business_name, category, description, photo_path, contact_link, suite, floor, sort_order) VALUES (?,?,?,?,?,?,?,?)"
  );
  // Real Alley tenants, with suite/floor matching lib/building-map.js codes.
  // [name, category, description, photo, link, suite, floor, sort]
  [
    ["Chelsea Funk Real Estate Team", "Real Estate", "Your Cache Valley real estate team. Mon–Fri, 10 AM–3 PM. (435) 512-4608.", "", "https://chelseafunkrealestate.com", "201", "upper", 1],
    ["Roadrunner Goods", "Shop", "An independent shop of goods worth finding. (435) 535-5673.", "", "https://roadrunnergoods.shop", "100", "lower", 2],
    ["Lucid Hair Collective", "Hair", "Hair by Caylee Funk and team — by appointment. (435) 754-9043.", "", "https://lucidhaircollective.com", "105", "lower", 3],
    ["Lavender & Sage Ink", "Ink", "Custom tattooing and ink work by appointment. (435) 881-9517.", "", "https://www.vagaro.com/lavenderandsageink", "102", "lower", 4],
    ["Monarch Piercing Studio", "Ink", "Professional piercing services by appointment.", "", "https://www.instagram.com/mpiercingstudio", "104", "lower", 5],
    ["Lash & Link", "Beauty", "Lash services by appointment. (435) 713-5739.", "", "https://www.instagram.com/lashes_byana1", "103", "lower", 6],
    ["Massage Genesis", "Healing", "Therapeutic massage with Michelle Jones — by appointment. (435) 248-2621.", "", "", "202", "upper", 7],
    ["RealtyPath Cache Valley", "Real Estate", "Real estate services in the heart of Cache Valley. (435) 512-4608.", "", "", "205", "upper", 8],
    ["The Alley Gallery", "Art", "Rotating local exhibitions, open to the public.", "", "/gallery", "gallery", "lower", 9],
    ["The Alley Loft", "Event Space", "Our upstairs event space — available to rent by the hour.", "", "/spaces", "200", "upper", 10],
  ].forEach((r) => dir.run(...r));

  // --- Gallery (duotone placeholders with captions + filter tags) ---
  const gal = db.prepare(
    "INSERT INTO gallery (image_path, caption, tags, sort_order) VALUES (?,?,?,?)"
  );
  // [image, caption, tags[], sort]
  [
    ["", "Center Street façade at dusk", ["The Building"], 1],
    ["", "The Loft, set for a workshop", ["The Loft", "Workshops"], 2],
    ["", "First Friday opening night", ["First Friday"], 3],
    ["", "Live set on the main floor", ["Main Floor", "Live Music"], 4],
    ["", "Saturday makers market", ["Markets"], 5],
    ["", "Art Beat main stage", ["Art Beat", "Live Music"], 6],
    ["", "Golden hour in the loft windows", ["The Loft"], 7],
    ["", "Wheel-throwing class in session", ["Workshops"], 8],
    ["", "The gallery wall, freshly re-hung", ["The Building"], 9],
    ["", "Food trucks on a closed Center St.", ["Art Beat", "Markets"], 10],
    ["", "Acoustic evening, lights low", ["Live Music", "Main Floor"], 11],
    ["", "Community potluck on the floor", ["Main Floor"], 12],
  ].forEach(([img, cap, tags, sort]) => gal.run(img, cap, JSON.stringify(tags), sort));

  // --- Exhibitors (current featured + past flip cards) ---
  const exh = db.prepare(
    "INSERT INTO exhibitors (name, discipline, when_text, blurb, profile_photo, site_handle, status, sort_order, active, active_from, active_until) VALUES (?,?,?,?,?,?,?,?,?,?,?)"
  );
  const exhWork = db.prepare(
    "INSERT INTO exhibitor_photos (exhibitor_id, image_path, caption, sort_order) VALUES (?,?,?,?)"
  );
  const seedExhibitor = (e) => {
    // current = on view now (end date in the future); past = ended already.
    const isPast = e.status === "past";
    const active_from = isPast ? dayOffset(-220 - e.sort * 30) : dayOffset(-20);
    const active_until = isPast ? dayOffset(-150 - e.sort * 25) : dayOffset(70);
    const id = exh.run(
      e.name, e.discipline, e.when_text, e.blurb, "", e.site_handle, e.status, e.sort,
      1, active_from, active_until
    ).lastInsertRowid;
    (e.works || []).forEach((cap, i) => exhWork.run(id, "", cap, i));
  };
  [
    {
      name: "Mara Ellison", discipline: "Painter · Oil & cold wax", when_text: "On view · Jul–Sep 2026",
      blurb: "Mara paints the valley at its quietest hours — dawn fog over the fields, the last light on a barn wall. Her current series was made entirely from the loft windows across a single summer.",
      site_handle: "@mara.makes", status: "current", sort: 1,
      works: ["Dawn series, no. 3", "Field study", "Barnlight", "Late August"],
    },
    {
      name: "Sage Coombs", discipline: "Cyanotype & botanical prints", when_text: "On view · Aug–Oct 2026",
      blurb: "Sage prints with sunlight and pressed plants gathered on valley trails. Each piece is a record of a single afternoon — the weather, the season, and forty-one wildflowers, in Prussian blue.",
      site_handle: "@sagecyanotype", status: "current", sort: 2,
      works: ["Wildflower index", "Fern study", "Sun print VII", "Meadow, July"],
    },
    { name: "Theo Brannan", discipline: "Screenprinter", when_text: "Spring 2025", blurb: "Bold three-color prints mapping the seams of the Wasatch front.", site_handle: "", status: "past", sort: 3, works: ["Fault Lines", "Ridge", "Quarry"] },
    { name: "Priya Anand", discipline: "Ceramicist", when_text: "Winter 2024", blurb: "Hand-pressed tiles and vessels that hum when the light rakes across them.", site_handle: "", status: "past", sort: 4, works: ["Quarry Song", "Vessel I", "Relief"] },
    { name: "R. Okafor", discipline: "Painter", when_text: "Fall 2024", blurb: "Night scenes of Center Street — warm windows, cool pavement, the last car home.", site_handle: "", status: "past", sort: 5, works: ["Nightshift", "Closing time", "Streetlight"] },
    { name: "Devon Ríos", discipline: "Risograph & zines", when_text: "Summer 2024", blurb: "Misregistered-on-purpose prints and a wall of community-made zines.", site_handle: "", status: "past", sort: 6, works: ["Static Bloom", "Zine wall", "Riso no. 12"] },
    { name: "Hana Vue", discipline: "Light sculpture", when_text: "Spring 2024", blurb: "Working sculptures in neon and forged steel that warm up as a room fills.", site_handle: "", status: "past", sort: 7, works: ["Carry the Light", "Filament", "Glow study"] },
    { name: "Jun Park", discipline: "Mixed media", when_text: "Winter 2023", blurb: "Layered panels of doorways over doorways — an ode to comings and goings.", site_handle: "", status: "past", sort: 8, works: ["Threshold", "Passage", "Doorframe"] },
  ].forEach(seedExhibitor);

  // --- Bookings ---
  const ins = db.prepare(`INSERT INTO bookings (
      space, date, start_time, hours, status, client_name, client_email, client_phone,
      event_type, guests, alcohol, notes, is_recurring, recurring_schedule, is_public_event,
      rate, sessions, deposit, total, square_invoice_id, payment_link, payment_status,
      hold_expires_at, deposit_status
    ) VALUES (
      @space,@date,@start_time,@hours,@status,@client_name,@client_email,@client_phone,
      @event_type,@guests,@alcohol,@notes,@is_recurring,@recurring_schedule,@is_public_event,
      @rate,@sessions,@deposit,@total,@square_invoice_id,@payment_link,@payment_status,
      @hold_expires_at,@deposit_status
    )`);

  const base = {
    event_type: null, guests: null, alcohol: 0, notes: null,
    is_recurring: 0, recurring_schedule: null, is_public_event: 0,
    rate: 75, sessions: 1, deposit: 150, total: 0,
    square_invoice_id: null, payment_link: null, payment_status: "unpaid",
    hold_expires_at: null, deposit_status: "pending",
  };
  const add = (o) => ins.run({ ...base, ...o }).lastInsertRowid;

  // 3 PENDING requests (incl. recurring yoga for the discount demo)
  add({
    space: "loft", date: dayOffset(18), start_time: "17:00", hours: 4, status: "pending",
    client_name: "Marisol Vega", client_email: "marisol@example.com", client_phone: "(435) 555-0142",
    event_type: "Birthday party", guests: "21–30", alcohol: 1,
    notes: "30th birthday — bringing our own cake and a playlist.", total: 450,
  });
  add({
    space: "main", date: dayOffset(22), start_time: "09:00", hours: 6, status: "pending",
    client_name: "Cache Valley Tech", client_email: "events@cvtech.example", client_phone: "(435) 555-0199",
    event_type: "Corporate event", guests: "31–50", notes: "All-hands offsite with catered lunch.", total: 600,
  });
  add({
    space: "loft", date: dayOffset(12), start_time: "08:00", hours: 1.5, status: "pending",
    client_name: "Priya Nandakumar", client_email: "priya.yoga@example.com", client_phone: "(435) 555-0188",
    event_type: "Workshop or class", guests: "11–20",
    notes: "Weekly sunrise yoga — hoping for a loyal-instructor rate.",
    is_recurring: 1, recurring_schedule: "Every Tuesday for 4 weeks", is_public_event: 1, total: 262.5,
  });

  // 3 CONFIRMED (paid) — two are public (drive the events demo), one private
  const lettering = add({
    space: "main", date: dayOffset(9), start_time: "18:00", hours: 3, status: "confirmed",
    client_name: "Dani Cho", client_email: "dani.letters@example.com", client_phone: "(435) 555-0151",
    event_type: "Workshop or class", guests: "11–20", is_public_event: 1,
    rate: 60, deposit: 150, total: 330,
    square_invoice_id: "SIM-INV-SEED-1", payment_link: "http://localhost:3000/pay/SIM-INV-SEED-1",
    payment_status: "paid",
  });
  const openmic = add({
    space: "loft", date: dayOffset(16), start_time: "19:00", hours: 3, status: "confirmed",
    client_name: "Marcus Lane", client_email: "marcus.openmic@example.com", client_phone: "(435) 555-0177",
    event_type: "Private gathering", guests: "21–30", is_public_event: 1,
    rate: 75, deposit: 150, total: 375,
    square_invoice_id: "SIM-INV-SEED-2", payment_link: "http://localhost:3000/pay/SIM-INV-SEED-2",
    payment_status: "paid",
  });
  add({
    space: "main", date: dayOffset(15), start_time: "17:00", hours: 4, status: "confirmed",
    client_name: "The Hales Rehearsal Dinner", client_email: "hales@example.com", client_phone: "(435) 555-0170",
    event_type: "Private gathering", guests: "31–50", alcohol: 1,
    rate: 75, deposit: 150, total: 450,
    square_invoice_id: "SIM-INV-SEED-3", payment_link: "http://localhost:3000/pay/SIM-INV-SEED-3",
    payment_status: "paid",
  });

  // 2 DEPOSITS to refund (paid, event already passed, deposit unresolved)
  add({
    space: "main", date: dayOffset(-3), start_time: "18:00", hours: 3, status: "confirmed",
    client_name: "Rivera Reception", client_email: "rivera@example.com", client_phone: "(435) 555-0123",
    event_type: "Private gathering", guests: "31–50", alcohol: 1,
    rate: 75, deposit: 150, total: 375,
    square_invoice_id: "SIM-INV-SEED-4", payment_status: "paid", deposit_status: "pending",
  });
  add({
    space: "loft", date: dayOffset(-1), start_time: "15:00", hours: 3, status: "confirmed",
    client_name: "Okafor Birthday", client_email: "okafor@example.com", client_phone: "(435) 555-0166",
    event_type: "Birthday party", guests: "11–20",
    rate: 75, deposit: 150, total: 375,
    square_invoice_id: "SIM-INV-SEED-5", payment_status: "paid", deposit_status: "pending",
  });

  // --- Public events ---
  const evIns = db.prepare(`INSERT INTO events (
      booking_id, host_name, title, description, date, time, space, kind, end_label, tickets, price,
      payment_instructions, payment_link, photo_path, pdf_paths, status, host_token
    ) VALUES (
      @booking_id,@host_name,@title,@description,@date,@time,@space,@kind,@end_label,@tickets,@price,
      @payment_instructions,@payment_link,@photo_path,@pdf_paths,@status,@host_token
    )`);
  const ev = (o) => evIns.run({ kind: null, end_label: null, ...o });

  // LIVE event — fully filled in, with flyer + Venmo (hosted by Dani Cho)
  ev({
    booking_id: lettering, host_name: "Dani Cho",
    title: "Hand-Lettering Workshop", kind: "Workshop", end_label: "6–9 PM",
    description:
      "Spend an evening learning the fundamentals of modern hand-lettering. We'll cover basic strokes, building letterforms, and a simple project to take home. All skill levels welcome — pens and paper provided, but bring your favorites if you have them.",
    date: dayOffset(9), time: "18:00", space: "main", tickets: 16, price: "$25",
    payment_instructions: "Venmo @dani-letters to reserve your spot, or pay cash at the door.",
    payment_link: "https://venmo.com/dani-letters",
    photo_path: "/uploads/samples/flyer-lettering.svg",
    pdf_paths: null, status: "live", host_token: nanoid(24),
  });

  // AWAITING host details — invite sent, host hasn't posted yet (draft)
  ev({
    booking_id: openmic, host_name: "Marcus Lane",
    title: "Private gathering", description: null,
    date: dayOffset(16), time: "19:00", space: "loft", tickets: null, price: null,
    payment_instructions: null, payment_link: null, photo_path: null,
    pdf_paths: null, status: "draft", host_token: nanoid(24),
  });

  // One of The Alley's OWN events, live
  ev({
    booking_id: null, host_name: "The Alley On Center",
    title: "First Friday Art Walk", kind: "Gallery", end_label: "6–9 PM",
    description: "Open studios, a rotating gallery wall, and live music drifting through the building. Free and open to all — come wander.",
    date: dayOffset(4), time: "18:00", space: "main", tickets: null, price: "Free",
    payment_instructions: "Free to attend — just show up!", payment_link: null,
    photo_path: "/uploads/samples/flyer-yoga.svg",
    pdf_paths: null, status: "live", host_token: null,
  });

  // Center Street Art Beat — the community music & arts fest (fixed date)
  ev({
    booking_id: null, host_name: "The Alley On Center",
    title: "Center Street Art Beat", kind: "Festival", end_label: "12–10 PM",
    description: "A community-powered music and arts fest built by the people who show up — a day celebrating the creativity, connection, and energy of our local community. Artists, musicians, vendors, and volunteers all welcome.",
    date: "2026-08-29", time: "12:00", space: "main", tickets: null, price: "Free",
    payment_instructions: "Free, all-day community festival. Want to perform, vend, or volunteer? Get in touch.",
    payment_link: null, photo_path: "/uploads/samples/flyer-yoga.svg",
    pdf_paths: null, status: "live", host_token: null,
  });
});

reset();

// Report
const counts = {
  directory: db.prepare("SELECT COUNT(*) n FROM directory").get().n,
  gallery: db.prepare("SELECT COUNT(*) n FROM gallery").get().n,
  pending: db.prepare("SELECT COUNT(*) n FROM bookings WHERE status='pending'").get().n,
  confirmed: db.prepare("SELECT COUNT(*) n FROM bookings WHERE status='confirmed'").get().n,
  live_events: db.prepare("SELECT COUNT(*) n FROM events WHERE status='live'").get().n,
  draft_events: db.prepare("SELECT COUNT(*) n FROM events WHERE status='draft'").get().n,
};
const liveToken = db.prepare("SELECT host_token FROM events WHERE status='live' AND host_token IS NOT NULL LIMIT 1").get();

console.log("Done. Seeded:", counts);
if (liveToken) {
  console.log(`Host listing link (demo): /host-listing/${liveToken.host_token}`);
}
console.log("Demo payment link (Hales): /pay/SIM-INV-SEED-3");

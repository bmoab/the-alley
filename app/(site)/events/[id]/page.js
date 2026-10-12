import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { canSellTickets, ticketsLeft, startTicketCheckout, MAX_PER_ORDER } from "@/lib/tickets.js";
import { getEvent, normalizeLinkUrl, parseEventLinks, getEventSessions, applySessionContent } from "@/lib/catalog.js";
import { directoryLinkLabel } from "@/lib/link-label.js";
import { formatDate, spaceName } from "@/lib/constants.js";
import { eventTimeLabel } from "@/lib/event-time.js";
import PhotoSlot from "@/components/site/PhotoSlot.js";
import EventPhoto from "@/components/site/EventPhoto.js";

export function generateMetadata({ params }) {
  const e = getEvent(params.id);
  return { title: e?.title || "Event" };
}

/**
 * Buy tickets to one of The Alley's own events: check spots, then off to a
 * Square checkout that adds sales tax. Square prices it from the catalog, so
 * nothing about the price comes from this form.
 */
async function buyTickets(formData) {
  "use server";
  const id = Number(formData.get("id"));
  let url;
  try {
    ({ url } = await startTicketCheckout(id, formData.get("qty"), { appUrl: process.env.APP_URL || "" }));
  } catch (err) {
    redirect(`/events/${id}?ticketError=${encodeURIComponent(err.message || "Couldn't start checkout — please try again.")}#tickets`);
  }
  redirect(url);
}

export default async function EventDetailPage({ params, searchParams }) {
  const e = getEvent(params.id);
  if (!e || e.status !== "live") notFound();
  const alleyTickets = canSellTickets(e) && e.ticket_sales_open && e.square_ticket_variation_id && e.ticket_price;
  const left = alleyTickets ? await ticketsLeft(e).catch(() => null) : null;
  const maxQty = left == null ? MAX_PER_ORDER : Math.min(MAX_PER_ORDER, left);
  const links = parseEventLinks(e);

  // Recurring series: pick the session (from ?d=, else the next upcoming, else
  // the first) and merge its per-session overrides over the shared listing.
  const sessions = getEventSessions(e);
  const isSeries = sessions.length > 1;
  const today = new Date().toISOString().slice(0, 10);
  const wanted = searchParams?.d;
  const selectedDate = isSeries
    ? (sessions.find((s) => s.date === wanted)?.date ||
       sessions.find((s) => s.date >= today)?.date ||
       sessions[0].date)
    : e.date;
  const selectedTime = isSeries
    ? (sessions.find((s) => s.date === selectedDate)?.time || e.time)
    : e.time;
  const m = isSeries ? applySessionContent(e, selectedDate) : e;

  let pdfs = [];
  try {
    pdfs = e.pdf_paths ? JSON.parse(e.pdf_paths) : [];
  } catch {
    pdfs = [];
  }

  return (
    <main className="ipage wrap" style={{ paddingTop: "clamp(110px,14vw,150px)" }}>
      <Link href="/calendar" className="rulelink" style={{ flexDirection: "row", alignItems: "center" }}>
        ← All events
      </Link>

      <div style={{ marginTop: 28, display: "grid", gap: "clamp(24px,4vw,48px)", gridTemplateColumns: "minmax(0,1.1fr) minmax(0,.9fr)" }} className="ev-detail-grid">
        {m.photo_path ? (
          // A real flyer: show it whole (posters are portrait and were being
          // cropped) and let attendees tap to read it full-screen.
          <EventPhoto src={m.photo_path} alt={m.title || "Event flyer"} caption={e.host_name || ""} />
        ) : (
          <PhotoSlot src={null} tag={m.title} showTag={false} variant="verde" style={{ minHeight: 320 }} />
        )}
        <div>
          <p className="eyebrow" style={{ color: "var(--verde-deep)" }}>
            {formatDate(selectedDate)}
            {/* Guest-facing time: the host's public times win over the
                reservation start that `selectedTime` carries. */}
            {eventTimeLabel({ ...e, time: selectedTime }) ? ` · ${eventTimeLabel({ ...e, time: selectedTime })}` : ""}
          </p>
          <h1 className="space-name" style={{ marginTop: 8 }}>{m.title}</h1>
          <p className="mono" style={{ color: "var(--ink-muted)", fontSize: 12, letterSpacing: ".06em" }}>
            {e.host_name ? `Hosted by ${e.host_name}` : "Hosted by The Alley"}
            {e.space ? ` · ${spaceName(e.space)}` : ""}
          </p>

          <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: "8px 28px" }}>
            {m.tickets ? <div><b>{m.tickets}</b> <span style={{ color: "var(--ink-muted)" }}>spots</span></div> : null}
            {m.price ? <div><b>{m.price}</b> <span style={{ color: "var(--ink-muted)" }}>per spot</span></div> : null}
          </div>

          {alleyTickets ? (
            <div id="tickets" className="card" style={{ marginTop: 22, padding: 20 }}>
              <p className="eyebrow" style={{ color: "var(--verde-deep)" }}>Tickets</p>
              {searchParams?.bought ? (
                <p style={{ marginTop: 8, color: "var(--ink)" }}>
                  Thank you — you&apos;re in! Square has emailed your receipt.
                </p>
              ) : null}
              <p style={{ marginTop: 8, color: "var(--ink-soft)", fontWeight: 300 }}>
                <b style={{ color: "var(--ink)", fontWeight: 600 }}>${Number(e.ticket_price).toFixed(2)}</b> per ticket, plus sales tax
                {left != null ? ` · ${left ? `${left} left` : "sold out"}` : ""}
              </p>
              {searchParams?.ticketError ? (
                <p style={{ marginTop: 8, color: "#9c4a2e" }}>{searchParams.ticketError}</p>
              ) : null}
              {maxQty > 0 ? (
                <form action={buyTickets} style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                  <input type="hidden" name="id" value={e.id} />
                  <select name="qty" defaultValue="1" className="field" style={{ width: "auto" }} aria-label="How many tickets">
                    {Array.from({ length: maxQty }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n} ticket{n === 1 ? "" : "s"}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="btn btn--solid">Buy tickets →</button>
                </form>
              ) : null}
              <p className="mono" style={{ marginTop: 12, fontSize: 11, color: "var(--ink-muted)" }}>
                Sold by The Alley. Checkout is through Square, which adds Utah sales tax.
              </p>
            </div>
          ) : null}

          {!alleyTickets && (e.payment_instructions || e.payment_link) ? (
            <div className="card" style={{ marginTop: 22, padding: 20 }}>
              <p className="eyebrow" style={{ color: "var(--verde-deep)" }}>How to reserve your spot</p>
              {e.payment_instructions ? <p style={{ marginTop: 8, color: "var(--ink-soft)", fontWeight: 300 }}>{e.payment_instructions}</p> : null}
              {e.payment_link ? (
                <a href={normalizeLinkUrl(e.payment_link)} target="_blank" rel="noreferrer" className="btn btn--solid" style={{ marginTop: 14 }}>
                  Pay the host →
                </a>
              ) : null}
              <p className="mono" style={{ marginTop: 12, fontSize: 11, color: "var(--ink-muted)" }}>
                The Alley provides this listing as a courtesy — payment goes directly to the host.
              </p>
            </div>
          ) : null}

          {links.length ? (
            <div style={{ marginTop: 22, display: "flex", flexWrap: "wrap", gap: 10 }}>
              {links.map((l, i) => (
                <a
                  key={i}
                  className={"btn " + (i === 0 ? "btn--solid" : "btn--ghost")}
                  href={l.url}
                  target={l.url.startsWith("http") ? "_blank" : undefined}
                  rel={l.url.startsWith("http") ? "noreferrer" : undefined}
                >
                  {directoryLinkLabel(l)} →
                </a>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {m.description ? (
        <div style={{ marginTop: 40, maxWidth: "60ch" }}>
          <h2 className="space-name" style={{ fontSize: "clamp(22px,2.4vw,30px)" }}>About this event</h2>
          <div style={{ marginTop: 12, whiteSpace: "pre-line", color: "var(--ink-soft)", fontWeight: 300, lineHeight: 1.7 }}>{m.description}</div>
        </div>
      ) : null}

      {isSeries ? (
        <div style={{ marginTop: 40, maxWidth: "70ch" }}>
          <h2 className="space-name" style={{ fontSize: "clamp(22px,2.4vw,30px)" }}>Sessions in this series</h2>
          <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
            {sessions.map((s) => {
              const sm = applySessionContent(e, s.date);
              const current = s.date === selectedDate;
              return (
                <Link
                  key={s.date}
                  href={`/events/${e.id}?d=${s.date}`}
                  scroll={false}
                  className="card"
                  style={{
                    padding: "12px 16px",
                    display: "flex",
                    alignItems: "baseline",
                    gap: 12,
                    flexWrap: "wrap",
                    borderColor: current ? "var(--verde-deep)" : undefined,
                    background: current ? "var(--verde, #e7efe6)" : undefined,
                  }}
                >
                  <span className="mono" style={{ fontSize: 12, color: "var(--verde-deep)", whiteSpace: "nowrap" }}>
                    {formatDate(s.date)}
                    {eventTimeLabel({ ...e, time: s.time }) ? ` · ${eventTimeLabel({ ...e, time: s.time })}` : ""}
                  </span>
                  <span style={{ fontWeight: current ? 600 : 400, color: "var(--ink)" }}>
                    {sm.title !== e.title ? sm.title : ""}
                  </span>
                  {sm.description && sm.description !== e.description ? (
                    <span style={{ color: "var(--ink-muted)", fontSize: 14 }}>
                      — {sm.description.length > 90 ? sm.description.slice(0, 90) + "…" : sm.description}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}

      {pdfs.length ? (
        <div style={{ marginTop: 32, maxWidth: "60ch" }}>
          <h2 className="space-name" style={{ fontSize: "clamp(22px,2.4vw,30px)" }}>Downloads</h2>
          <ul style={{ marginTop: 12, listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
            {pdfs.map((p, i) => (
              <li key={i}>
                <a href={p} target="_blank" rel="noreferrer" className="rulelink" style={{ flexDirection: "row" }}>
                  ↓ {p.split("/").pop()}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </main>
  );
}

import Link from "next/link";
import PhotoSlot from "@/components/site/PhotoSlot.js";
import { formatTime } from "@/lib/constants.js";

function fmtEvDate(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return {
    mo: dt.toLocaleDateString("en-US", { month: "short" }),
    dy: d,
    wd: dt.toLocaleDateString("en-US", { weekday: "short" }),
  };
}

const VARIANTS = ["", "verde", "soft"];

/** Upcoming events row (homepage). `events` = up to 3 live event rows. */
export default function EventsRow({ events = [] }) {
  if (!events.length) {
    return (
      <div className="ev-empty">
        No public events are listed yet — check back soon, or{" "}
        <Link className="linkish" href="/spaces">host your own</Link>.
      </div>
    );
  }
  return (
    <div className="ev-grid">
      {events.map((e, i) => {
        const d = fmtEvDate(e.date);
        const when = e.end_label || (e.time ? formatTime(e.time) : "");
        return (
          <Link key={e.key ?? e.id} href={`/events/${e.id}`} className="ev-card reveal">
            <PhotoSlot src={e.photo_path || null} tag={e.kind || "Event"} variant={VARIANTS[i % 3]} className="ev-photo" />
            <div className="ev-datechip mono"><b>{d.dy}</b><span>{d.mo}</span></div>
            <div className="ev-body">
              <span className="ev-when mono">
                {d.wd}
                {when ? ` · ${when}` : ""}
                {e.kind ? ` · ${e.kind}` : ""}
              </span>
              <h3 className="ev-name">{e.title}</h3>
              {e.description ? <p className="ev-blurb">{e.description}</p> : null}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

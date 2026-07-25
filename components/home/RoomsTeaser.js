import PhotoSlot from "@/components/site/PhotoSlot.js";

/**
 * "Rent a space" teaser, one card per bookable space. Each "Request to book"
 * links to /spaces#book-{id}, which the BookProvider opens as the booking modal.
 * `rooms` = [{ id, name, location, capacity, blurb, rateLabel, tag, image }].
 */
// Placeholder tints cycled per card so no two neighbours share one.
const VARIANTS = ["verde", "soft", ""];
export default function RoomsTeaser({ rooms = [] }) {
  return (
    <div className="rooms-grid">
      {rooms.map((r, i) => (
        <article key={r.id} className="room reveal">
          <PhotoSlot src={r.image || null} tag={r.tag} variant={VARIANTS[i % VARIANTS.length]} className="room-photo" />
          <div className="room-body">
            <div className="room-meta mono">
              <span>{r.location}</span>
              {r.capacity ? (
                <>
                  <span className="dot">····</span>
                  <span>{r.capacity}</span>
                </>
              ) : null}
            </div>
            <h3 className="room-name">{r.name}</h3>
            <p className="room-blurb">{r.blurb}</p>
            <div className="room-foot">
              <span className="room-rate mono">{r.rateLabel}</span>
              <a className="btn btn--solid room-book" href={`/spaces#book-${r.id}`}>
                Request to book <span className="arrow">→</span>
              </a>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

import PhotoSlot from "@/components/site/PhotoSlot.js";

/**
 * Two-room "rent a space" teaser. Each "Request to book" links to
 * /spaces#book-{id}, which the BookProvider opens as the booking modal.
 * `rooms` = [{ id, name, location, capacity, blurb, rateLabel, tag, image }].
 */
export default function RoomsTeaser({ rooms = [] }) {
  return (
    <div className="rooms-grid">
      {rooms.map((r, i) => (
        <article key={r.id} className="room reveal">
          <PhotoSlot src={r.image || null} tag={r.tag} variant={i === 0 ? "verde" : "soft"} className="room-photo" />
          <div className="room-body">
            <div className="room-meta mono">
              <span>{r.location}</span>
              <span className="dot">····</span>
              <span>{r.capacity}</span>
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

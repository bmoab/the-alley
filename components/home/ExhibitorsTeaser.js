import Link from "next/link";
import PhotoSlot from "@/components/site/PhotoSlot.js";
import { Arrow } from "@/components/site/Primitives.js";

const VARIANTS = ["verde", "soft", "", "verde"];

/** Homepage teaser: current exhibitors, compact cards linking to /exhibitors. */
export default function ExhibitorsTeaser({ exhibitors = [] }) {
  if (!exhibitors.length) return null;
  return (
    <div className="extz-grid">
      {exhibitors.map((ex, i) => (
        <Link key={ex.id} href="/exhibitors" className="extz-card reveal">
          <PhotoSlot src={ex.profile_photo || null} tag={ex.name} variant={VARIANTS[i % VARIANTS.length]} className="extz-portrait" />
          <div className="extz-body">
            <span className="extz-when mono">{ex.when_text}</span>
            <h3 className="extz-name">{ex.name}</h3>
            <p className="extz-disc mono">{ex.discipline}</p>
            <p className="extz-blurb">{ex.blurb}</p>
            <span className="extz-go mono">View exhibitor <Arrow /></span>
          </div>
        </Link>
      ))}
    </div>
  );
}

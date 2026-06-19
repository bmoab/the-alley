import Link from "next/link";
import PhotoSlot from "@/components/site/PhotoSlot.js";
import { Arrow } from "@/components/site/Primitives.js";
import { formatMonthRange } from "@/lib/constants.js";

const VARIANTS = ["verde", "soft", "", "verde"];

function whenLabel(ex) {
  const range = formatMonthRange(ex.active_from, ex.active_until) || ex.when_text || "";
  return range ? `On view · ${range}` : "On view";
}

/** Homepage teaser: current exhibitors, compact cards linking to /exhibitors. */
export default function ExhibitorsTeaser({ exhibitors = [] }) {
  if (!exhibitors.length) return null;
  return (
    <div className="extz-grid">
      {exhibitors.map((ex, i) => (
        <Link key={ex.id} href="/exhibitors" className="extz-card reveal">
          <PhotoSlot src={ex.profile_photo || null} tag={ex.name} variant={VARIANTS[i % VARIANTS.length]} className="extz-portrait" />
          <div className="extz-body">
            <span className="extz-when mono">{whenLabel(ex)}</span>
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

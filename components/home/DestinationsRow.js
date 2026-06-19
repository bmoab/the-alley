import Link from "next/link";
import { Arrow } from "@/components/site/Primitives.js";

/** The four "what you'll find here" destination cards. */
export default function DestinationsRow({ items = [] }) {
  return (
    <div className="dest-grid">
      {items.map((d, i) => (
        <Link key={d.title} href={d.href} className="dest-card reveal">
          <span className="dest-num mono">0{i + 1}</span>
          <span className="dest-title">{d.title}</span>
          <span className="dest-blurb">{d.blurb}</span>
          <span className="dest-go mono">Explore <Arrow /></span>
        </Link>
      ))}
    </div>
  );
}

import Link from "next/link";
import { getContent } from "@/lib/db.js";
import { AlleyBadge } from "@/components/Motifs.js";

export default function SiteFooter() {
  const c = getContent();
  return (
    <footer className="mt-20 border-t border-ink/10 bg-ink text-paper">
      <div className="container-content grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-1">
          <AlleyBadge className="mb-5 h-20 w-20 text-brass-light" />
          <div className="font-display text-xl font-semibold">
            The Alley <span className="text-brass-light">On Center</span>
          </div>
          <p className="mt-3 max-w-xs text-sm text-paper/60">
            Art is what we use to decorate space. Music is what we use to
            decorate time.
          </p>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-brass-light">
            Visit
          </h3>
          <ul className="mt-4 space-y-2 text-sm text-paper/70">
            <li><Link href="/directory" className="hover:text-paper">Directory</Link></li>
            <li><Link href="/spaces" className="hover:text-paper">The Loft</Link></li>
            <li><Link href="/gallery" className="hover:text-paper">The Alley Gallery</Link></li>
            <li><Link href="/art-beat" className="hover:text-paper">Center Street Art Beat</Link></li>
            <li><Link href="/events" className="hover:text-paper">Calendar</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-brass-light">
            Get in touch
          </h3>
          <ul className="mt-4 space-y-2 text-sm text-paper/70">
            <li>{c.contact_address}</li>
            <li>
              <a href={`mailto:${c.contact_email}`} className="hover:text-paper">
                {c.contact_email}
              </a>
            </li>
            <li>
              <a href={`tel:${c.contact_phone}`} className="hover:text-paper">
                {c.contact_phone}
              </a>
            </li>
            <li className="flex gap-3 pt-1">
              {c.social_instagram ? (
                <a href={c.social_instagram} target="_blank" rel="noreferrer" className="hover:text-paper">Instagram</a>
              ) : null}
              {c.social_facebook ? (
                <a href={c.social_facebook} target="_blank" rel="noreferrer" className="hover:text-paper">Facebook</a>
              ) : null}
            </li>
          </ul>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-brass-light">
            Host with us
          </h3>
          <ul className="mt-4 space-y-2 text-sm text-paper/70">
            <li><Link href="/book" className="hover:text-paper">Request to Book</Link></li>
            <li><Link href="/spaces" className="hover:text-paper">Rates & spaces</Link></li>
            <li><Link href="/admin" className="hover:text-paper">Owner login</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-paper/10">
        <div className="container-content py-5 text-xs text-paper/40">
          © {new Date().getFullYear()} The Alley On Center · Logan, Utah
        </div>
      </div>
    </footer>
  );
}

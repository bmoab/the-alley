import Link from "next/link";
import { getContent } from "@/lib/db.js";
import { FOOTER_COLS } from "@/components/site/nav.js";
import FitWordmark from "@/components/site/FitWordmark.js";

export default function SiteFooter() {
  const c = getContent();
  const year = new Date().getFullYear();
  return (
    <footer className="footer footer--dark">
      <FitWordmark text="THE ALLEY ON CENTER" />

      <div className="footer-motto">
        <span className="footer-motto-accent">Art</span> is what we use to decorate space.
        <br />
        <span className="footer-motto-accent">Music</span> is what we use to decorate time.
      </div>

      <div className="wrap footer-grid">
        <div className="footer-col">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="footer-logo" src="/brand/logo-horizontal-white.png" alt="The Alley On Center" />
          <p className="footer-quote">
            A home for music, art, events &amp; community in the heart of downtown Logan.
          </p>
          <div className="footer-social">
            {c.social_instagram ? (
              <a href={c.social_instagram} target="_blank" rel="noreferrer" data-edit="social_instagram">Instagram</a>
            ) : null}
            {c.social_facebook ? (
              <a href={c.social_facebook} target="_blank" rel="noreferrer" data-edit="social_facebook">Facebook</a>
            ) : null}
          </div>
        </div>

        {FOOTER_COLS.map((col) => (
          <div className="footer-col" key={col.head}>
            <p className="footer-head">{col.head}</p>
            <ul>
              {col.links.map((l) => (
                <li key={l.t + l.h}>
                  <Link href={l.h}>{l.t}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="footer-col">
          <p className="footer-head">Get in touch</p>
          <ul className="footer-contact">
            <li>{c.contact_address}</li>
            <li><a href={`mailto:${c.contact_email}`}>{c.contact_email}</a></li>
            <li><a href={`tel:${(c.contact_phone || "").replace(/[^\d+]/g, "")}`}>{c.contact_phone}</a></li>
          </ul>
        </div>
      </div>

      <div className="wrap footer-base">
        <span>© {year} The Alley On Center</span>
        {/* Mirror the homepage hero eyebrow so the founding line always matches. */}
        <span>{c.home_hero_eyebrow || "Logan, Utah · Founded 2023"}</span>
      </div>
    </footer>
  );
}

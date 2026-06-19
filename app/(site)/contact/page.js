import Link from "next/link";
import { getContent } from "@/lib/db.js";
import PageHero from "@/components/site/PageHero.js";

export const metadata = { title: "Contact" };

export default function ContactPage() {
  const c = getContent();
  const address = c.contact_address || "19 W Center St., Logan, UT 84321";
  const email = c.contact_email || "thealleyoncenter@gmail.com";
  const phone = c.contact_phone || "(435) 512-4608";
  const mapSrc = `https://maps.google.com/maps?q=${encodeURIComponent(address)}&z=16&output=embed`;
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;

  return (
    <main className="ipage">
      <PageHero
        eyebrow="Say hello"
        title="Contact"
        lede="Questions about a booking, the building, or becoming a tenant? Send us an email or stop by — we'd love to hear from you."
      />
      <section className="wrap">
        <div className="contact-grid">
          <div>
            <dl className="contact-dl">
              <div>
                <div className="k">Email</div>
                <div className="v"><a href={`mailto:${email}`}>{email}</a></div>
              </div>
              <div>
                <div className="k">Phone</div>
                <div className="v"><a href={`tel:${phone.replace(/[^\d]/g, "")}`}>{phone}</a></div>
              </div>
              <div>
                <div className="k">Find us</div>
                <div className="v">{address}</div>
                <div className="v" style={{ marginTop: 6 }}>
                  <a
                    href={directions}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontFamily: "var(--font-mono)", fontSize: 13, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--verde-deep)" }}
                  >
                    Get directions →
                  </a>
                </div>
              </div>
              {c.social_instagram ? (
                <div>
                  <div className="k">Follow</div>
                  <div className="v"><a href={c.social_instagram} target="_blank" rel="noreferrer">@thealleyoncenter</a></div>
                </div>
              ) : null}
            </dl>
            <Link className="btn btn--solid" href="/spaces" style={{ marginTop: 30 }}>Request to Book a Space</Link>
          </div>
          <div className="contact-map">
            <iframe title="Map to The Alley On Center" src={mapSrc} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
          </div>
        </div>
      </section>
    </main>
  );
}

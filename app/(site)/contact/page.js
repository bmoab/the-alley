import { getContent } from "@/lib/db.js";

export const metadata = { title: "Contact" };

export default function ContactPage() {
  const c = getContent();
  const address = c.contact_address || "19 W Center St., Logan, UT 84321";
  const mapSrc = `https://maps.google.com/maps?q=${encodeURIComponent(
    address
  )}&z=16&output=embed`;
  const directionsHref = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    address
  )}`;

  return (
    <main className="container-content py-14">
      <div className="grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <p className="eyebrow">Say hello</p>
          <h1 className="mt-2 font-display text-4xl font-semibold text-ink">Contact</h1>
          <p className="mt-3 text-lg text-ink-muted">
            Questions about a booking, the building, or becoming a tenant? Send us
            an email or stop by — we&apos;d love to hear from you.
          </p>

          <dl className="mt-8 space-y-5 text-ink-soft">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-brass-dark">Email</dt>
              <dd className="mt-1 text-lg">
                <a className="font-medium hover:underline" href={`mailto:${c.contact_email}`}>
                  {c.contact_email}
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-brass-dark">Phone</dt>
              <dd className="mt-1">
                <a className="hover:underline" href={`tel:${c.contact_phone}`}>{c.contact_phone}</a>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-brass-dark">Find us</dt>
              <dd className="mt-1">{address}</dd>
              <dd className="mt-2">
                <a
                  href={directionsHref}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-semibold text-brass-dark hover:underline"
                >
                  Get directions →
                </a>
              </dd>
            </div>
            {c.social_instagram || c.social_facebook ? (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-brass-dark">Follow</dt>
                <dd className="mt-1 flex gap-4">
                  {c.social_instagram ? (
                    <a className="hover:underline" href={c.social_instagram} target="_blank" rel="noreferrer">Instagram</a>
                  ) : null}
                  {c.social_facebook ? (
                    <a className="hover:underline" href={c.social_facebook} target="_blank" rel="noreferrer">Facebook</a>
                  ) : null}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>

        <div className="lg:col-span-7">
          <div className="card overflow-hidden">
            <iframe
              title={`Map to ${address}`}
              src={mapSrc}
              className="h-[420px] w-full border-0 lg:h-full"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          </div>
        </div>
      </div>
    </main>
  );
}

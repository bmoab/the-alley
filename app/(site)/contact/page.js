import { redirect } from "next/navigation";
import { db, getContent } from "@/lib/db.js";

export const metadata = { title: "Contact" };

async function submitContact(formData) {
  "use server";
  const name = (formData.get("name") || "").toString().trim();
  const email = (formData.get("email") || "").toString().trim();
  const message = (formData.get("message") || "").toString().trim();
  if (!name || !email || !message) {
    redirect("/contact?error=1");
  }
  db.prepare(
    "INSERT INTO contact_messages (name, email, message) VALUES (?, ?, ?)"
  ).run(name, email, message);

  // Email the owner. (Wired to a real provider in build priority #6; for now
  // this is a console-logged stub so the flow is complete.)
  console.log(
    `[contact] New message from ${name} <${email}>:\n${message}`
  );
  redirect("/contact?sent=1");
}

export default function ContactPage({ searchParams }) {
  const c = getContent();
  const sent = searchParams?.sent;
  const error = searchParams?.error;

  return (
    <main className="container-content py-14">
      <div className="grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <p className="eyebrow">Say hello</p>
          <h1 className="mt-2 font-display text-4xl font-semibold text-ink">Contact</h1>
          <p className="mt-3 text-lg text-ink-muted">
            Questions about a booking, the building, or becoming a tenant?
            We&apos;d love to hear from you.
          </p>

          <dl className="mt-8 space-y-4 text-ink-soft">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-brass-dark">Email</dt>
              <dd><a className="hover:underline" href={`mailto:${c.contact_email}`}>{c.contact_email}</a></dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-brass-dark">Phone</dt>
              <dd><a className="hover:underline" href={`tel:${c.contact_phone}`}>{c.contact_phone}</a></dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-brass-dark">Find us</dt>
              <dd>{c.contact_address}</dd>
            </div>
          </dl>
        </div>

        <div className="lg:col-span-7">
          <div className="card p-7">
            {sent ? (
              <div className="rounded-lg border border-brass/30 bg-brass/10 px-4 py-3 text-sm text-brass-dark">
                Thank you — your message is on its way. We&apos;ll be in touch soon.
              </div>
            ) : null}
            {error ? (
              <div className="mb-4 rounded-lg border border-rust/30 bg-rust/10 px-4 py-3 text-sm text-rust">
                Please fill in your name, email, and a message.
              </div>
            ) : null}

            <form action={submitContact} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="name">Your name</label>
                  <input id="name" name="name" required className="field" />
                </div>
                <div>
                  <label className="label" htmlFor="email">Email</label>
                  <input id="email" name="email" type="email" required className="field" />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="message">Message</label>
                <textarea id="message" name="message" rows={6} required className="field" />
              </div>
              <button type="submit" className="btn-primary">Send message</button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}

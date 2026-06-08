import Link from "next/link";
import { redirect } from "next/navigation";
import { listBookings } from "@/lib/bookings.js";
import { listLiveEvents } from "@/lib/catalog.js";
import { sendEmail } from "@/lib/email.js";
import { BOOKING_STATUS } from "@/lib/constants.js";

export const metadata = { title: "Dashboard" };

// TEMP (pre-launch email check): sends a test email to the owner address to
// confirm Gmail SMTP works from the live server. Remove this action + the
// "Email check" card below once email is verified in production.
async function sendTestEmail() {
  "use server";
  const to = process.env.OWNER_EMAIL || "thealleyoncenter@gmail.com";
  let mode = "console";
  let ok = false;
  try {
    const res = await sendEmail({
      to,
      subject: "Test email — The Alley On Center",
      html: `<p>This is a test email from your website's admin dashboard.</p>
             <p>If you're reading this in your inbox, email sending works. 🎉</p>`,
    });
    mode = res.mode;
    ok = res.ok;
  } catch (err) {
    console.error("[admin] test email error:", err.message);
  }
  redirect(`/admin?test=${ok ? "ok" : "fail"}&mode=${mode}`);
}

function StatCard({ label, value, href, hint }) {
  return (
    <Link href={href} className="card block p-5 transition hover:border-brass/50">
      <div className="text-3xl font-semibold text-ink">{value}</div>
      <div className="mt-1 text-sm font-semibold text-ink-soft">{label}</div>
      {hint ? <div className="mt-0.5 text-xs text-ink-muted">{hint}</div> : null}
    </Link>
  );
}

export default function AdminDashboard({ searchParams }) {
  const pending = listBookings({ status: BOOKING_STATUS.PENDING });
  const held = listBookings({ status: BOOKING_STATUS.HELD });
  const confirmed = listBookings({ status: BOOKING_STATUS.CONFIRMED });
  const liveEvents = listLiveEvents();
  const test = searchParams?.test;
  const mode = searchParams?.mode;

  return (
    <div>
      <p className="eyebrow">Overview</p>
      <h1 className="font-display text-3xl font-semibold text-ink">Dashboard</h1>
      <p className="mt-1 text-ink-muted">
        Everything happening at The Alley, at a glance.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Pending requests"
          value={pending.length}
          href="/admin/requests"
          hint="Awaiting your review"
        />
        <StatCard
          label="Held bookings"
          value={held.length}
          href="/admin/bookings"
          hint="Awaiting payment"
        />
        <StatCard
          label="Confirmed"
          value={confirmed.length}
          href="/admin/bookings"
          hint="Paid & on the calendar"
        />
        <StatCard
          label="Live events"
          value={liveEvents.length}
          href="/admin/events"
          hint="Public listings"
        />
      </div>

      {/* TEMP: pre-launch email check. Remove this card + sendTestEmail action
          once email delivery is confirmed in production. */}
      <div className="mt-8 card p-6">
        <h2 className="font-display text-xl font-semibold text-ink">
          Email check
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Send a test email to{" "}
          <strong>{process.env.OWNER_EMAIL || "thealleyoncenter@gmail.com"}</strong>{" "}
          to confirm email sending works. (Temporary — we&apos;ll remove this
          after launch.)
        </p>

        {test === "ok" ? (
          <div className="mt-4 rounded-lg border border-brass/40 bg-brass/20 px-4 py-2 text-sm text-ink">
            {mode === "smtp" || mode === "resend"
              ? `Sent via ${mode}. Check the inbox — it should arrive shortly.`
              : `The app reported success but used "${mode}" mode (no live email provider). Check the server config.`}
          </div>
        ) : null}
        {test === "fail" ? (
          <div className="mt-4 rounded-lg border border-rust/30 bg-rust/10 px-4 py-2 text-sm text-rust">
            Sending failed (mode: {mode}). Check the SMTP settings / server logs.
          </div>
        ) : null}

        <form action={sendTestEmail} className="mt-4">
          <button type="submit" className="btn-primary">
            Send test email
          </button>
        </form>
      </div>
    </div>
  );
}

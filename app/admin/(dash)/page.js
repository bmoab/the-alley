import { redirect } from "next/navigation";
import { Inbox, Clock, CalendarCheck, Megaphone } from "lucide-react";
import { listBookings } from "@/lib/bookings.js";
import { listLiveEvents } from "@/lib/catalog.js";
import { sendEmail } from "@/lib/email.js";
import { BOOKING_STATUS } from "@/lib/constants.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import StatCard from "@/components/admin/ui/StatCard.js";
import Card from "@/components/admin/ui/Card.js";
import Button from "@/components/admin/ui/Button.js";

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

export default function AdminDashboard() {
  const pending = listBookings({ status: BOOKING_STATUS.PENDING });
  const held = listBookings({ status: BOOKING_STATUS.HELD });
  const confirmed = listBookings({ status: BOOKING_STATUS.CONFIRMED });
  const liveEvents = listLiveEvents();

  return (
    <div>
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        subtitle="Everything happening at The Alley, at a glance."
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Pending requests"
          value={pending.length}
          href="/admin/requests"
          hint="Awaiting your review"
          icon={Inbox}
          accent
        />
        <StatCard
          label="Held bookings"
          value={held.length}
          href="/admin/bookings"
          hint="Awaiting payment"
          icon={Clock}
        />
        <StatCard
          label="Confirmed"
          value={confirmed.length}
          href="/admin/bookings"
          hint="Paid & on the calendar"
          icon={CalendarCheck}
        />
        <StatCard
          label="Live events"
          value={new Set(liveEvents.map((e) => e.id)).size}
          href="/admin/events"
          hint="Public listings"
          icon={Megaphone}
        />
      </div>

      {/* TEMP: pre-launch email check. Remove this card + sendTestEmail action
          once email delivery is confirmed in production. The result toast is
          handled globally by <Toaster /> via the ?test= redirect param. */}
      <Card pad="lg" className="mt-8">
        <h2 className="text-lg font-semibold text-ink">Email check</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Send a test email to{" "}
          <strong>{process.env.OWNER_EMAIL || "thealleyoncenter@gmail.com"}</strong>{" "}
          to confirm email sending works. (Temporary — we&apos;ll remove this
          after launch.)
        </p>
        <form action={sendTestEmail} className="mt-4">
          <Button type="submit">Send test email</Button>
        </form>
      </Card>
    </div>
  );
}

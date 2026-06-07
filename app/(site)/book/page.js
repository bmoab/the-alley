import { getSettings } from "@/lib/db.js";
import BookingFlow from "@/components/BookingFlow.js";

export const metadata = { title: "Request to Book" };

export default function BookPage() {
  const settings = getSettings();

  return (
    <main className="container-content py-14">
      <div className="mx-auto mb-8 max-w-2xl text-center">
        <p className="eyebrow">Request to Book</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-ink">
          Reserve a space at The Alley
        </h1>
        <p className="mt-3 text-ink-muted">
          Tell us what you&apos;re planning. We&apos;ll review your request and email
          you within 24 hours — no payment is taken until you&apos;re approved.
        </p>
      </div>
      <BookingFlow
        settings={{
          standard_rate: settings.standard_rate,
          deposit: settings.deposit,
          minimum_hours: settings.minimum_hours,
          open_hour: settings.open_hour,
          close_hour: settings.close_hour,
        }}
      />
    </main>
  );
}

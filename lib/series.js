import { getSetting } from "./db.js";
import {
  listSeriesDatesToInvoice,
  setInvoiceInfo,
  getBooking,
  rentalAmount,
} from "./bookings.js";
import { createBookingInvoice } from "./square.js";
import { isClosedForBooking } from "./closures.js";
import { emailClientSeriesInvoice } from "./email.js";
import { logEmail, logActivity } from "./activity.js";

const SYSTEM = { actorUserId: null, actorName: "system" };

/**
 * Recurring-series rolling invoicing. For each reserved series date inside the
 * lead window that has no invoice yet, create + send its rental invoice. The
 * first session is invoiced at approval, so it already has an id and is skipped
 * (idempotent via invoice-id presence). A real cron hits this daily; we re-check
 * closures here so a date the owner closed after approval isn't invoiced.
 * Returns the number of invoices sent.
 */
export async function runSeriesInvoices(now = new Date()) {
  const leadDays = Number(getSetting("series_invoice_lead_days", "5")) || 5;
  const due = listSeriesDatesToInvoice(now, leadDays);
  let sent = 0;
  for (const b of due) {
    const [sh, sm] = b.start_time.split(":").map(Number);
    const startHour = sh + (sm || 0) / 60;
    if (isClosedForBooking(b.space, b.date, startHour, startHour + b.hours)) {
      console.warn(`[series] skipping invoice for #${b.id} (${b.date}) — now closed`);
      continue;
    }
    try {
      const { invoiceId, paymentLink } = await createBookingInvoice(b);
      setInvoiceInfo(b.id, { invoiceId, paymentLink });
      const updated = getBooking(b.id);
      const res = await emailClientSeriesInvoice(updated);
      logEmail({
        bookingId: b.id,
        eventType: "invoice_sent",
        description: `Rental invoice auto-sent · session ${b.series_index} of ${b.series_total}`,
        recipientEmail: b.client_email,
        amount: rentalAmount(b),
        sendResult: res,
        ...SYSTEM,
      });
      logActivity({
        bookingId: b.id,
        eventType: "invoice_sent",
        description: `Rental invoice auto-sent · session ${b.series_index} of ${b.series_total}`,
        amount: rentalAmount(b),
        ...SYSTEM,
      });
      sent++;
    } catch (err) {
      console.error(`[series] invoice failed for #${b.id}:`, err.message);
    }
  }
  return sent;
}

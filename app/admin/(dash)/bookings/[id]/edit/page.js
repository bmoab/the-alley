import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getBooking } from "@/lib/bookings.js";
import { reissueInvoice } from "@/lib/payments.js";
import { getActor } from "@/lib/auth.js";
import { spaceName, formatDate, formatTime, formatMoney } from "@/lib/constants.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import Card from "@/components/admin/ui/Card.js";
import Badge from "@/components/admin/ui/Badge.js";
import Button from "@/components/admin/ui/Button.js";
import ReissueForm from "@/components/admin/ReissueForm.js";

export const metadata = { title: "Edit invoice" };

async function saveAndReissue(formData) {
  "use server";
  const id = Number(formData.get("id"));
  const booking = getBooking(id);
  if (!booking) redirect("/admin/bookings");

  const result = await reissueInvoice(
    id,
    {
      rate: formData.get("rate"),
      hours: formData.get("hours"),
      sessions: booking.sessions || 1, // sessions aren't edited here
      deposit: formData.get("deposit"),
    },
    await getActor()
  );

  revalidatePath("/admin/bookings");
  revalidatePath("/admin");
  revalidatePath("/admin/events");

  if (result?.error === "already_paid") {
    redirect(
      `/admin/bookings?toast=${encodeURIComponent(
        `Booking #${id} is already paid — reprice it in Square instead.`
      )}&toastType=error`
    );
  }

  const msg = result?.comped
    ? `Booking #${id} repriced to free — no invoice, and it's confirmed.`
    : result?.staleInvoiceWarning
      ? `Reissued invoice #${id} at ${formatMoney(result.booking.total)}, but the OLD Square invoice couldn't be voided — cancel it by hand in Square.`
      : `Invoice #${id} reissued at ${formatMoney(result.booking.total)} and emailed to the client.`;
  redirect(
    `/admin/bookings?toast=${encodeURIComponent(msg)}&toastType=${
      result?.staleInvoiceWarning ? "neutral" : "success"
    }`
  );
}

export default async function EditInvoicePage({ params }) {
  const id = Number(params.id);
  const booking = getBooking(id);
  if (!booking) redirect("/admin/bookings");

  // Only an approved, unpaid booking can be repriced here. A paid one must be
  // sorted out in Square (refund/adjust), and pending ones are priced at approval.
  const editable =
    booking.payment_status !== "paid" &&
    (booking.status === "held" || booking.status === "reserved");

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader
        title="Edit invoice"
        subtitle="Change the price on an approved-but-unpaid booking. The old invoice is voided and a corrected one is emailed to the client."
      />

      <Card pad="lg">
        <div className="flex items-start justify-between gap-3 border-b border-line pb-4">
          <div>
            <div className="font-semibold text-ink">{booking.client_name}</div>
            <div className="text-sm text-ink-muted">{booking.client_email}</div>
            <div className="mt-1 text-sm text-ink-soft">
              {spaceName(booking.space)} · {formatDate(booking.date)} · {formatTime(booking.start_time)}
            </div>
          </div>
          <div className="text-right">
            <Badge status={booking.status} />
            <div className="mt-1 text-sm capitalize text-ink-muted">{booking.payment_status || "unpaid"}</div>
          </div>
        </div>

        {!editable ? (
          <div className="mt-5 text-sm text-ink-soft">
            {booking.payment_status === "paid"
              ? "This booking is already paid — to change what was charged, issue a refund or adjustment in Square."
              : "Only an approved (held or reserved) booking can be repriced here."}
            <div className="mt-4">
              <Button href="/admin/bookings" variant="ghost" size="sm">← Back to bookings</Button>
            </div>
          </div>
        ) : (
          <ReissueForm booking={booking} action={saveAndReissue} />
        )}
      </Card>
    </div>
  );
}

import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { listBookings, getBooking } from "@/lib/bookings.js";
import { confirmBookingPaid, releaseExpiredHolds } from "@/lib/payments.js";
import { getInvoiceStatus } from "@/lib/square.js";
import { getActor } from "@/lib/auth.js";
import {
  SPACES,
  spaceName,
  formatDate,
  formatTime,
  formatMoney,
} from "@/lib/constants.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import Card from "@/components/admin/ui/Card.js";
import Badge from "@/components/admin/ui/Badge.js";
import Button from "@/components/admin/ui/Button.js";
import { DataTable, Tr, Td } from "@/components/admin/ui/DataTable.js";
import { cx } from "@/components/admin/ui/cx.js";

export const metadata = { title: "Bookings" };

async function markPaid(formData) {
  "use server";
  const id = Number(formData.get("id"));
  await confirmBookingPaid(id, await getActor());
  revalidatePath("/admin/bookings");
  revalidatePath("/admin");
  revalidatePath("/admin/events");
  redirect("/admin/bookings?paid=" + id);
}

// Ask Square whether the invoice has been paid; if so, confirm the booking.
async function checkPayment(formData) {
  "use server";
  const id = Number(formData.get("id"));
  const b = getBooking(id);
  let result = "nopay";
  if (b?.square_invoice_id) {
    try {
      const status = await getInvoiceStatus(b.square_invoice_id);
      if (status === "paid") {
        await confirmBookingPaid(id, await getActor());
        result = "paid";
      }
    } catch (err) {
      console.error("[bookings] check payment error:", err.message);
      result = "error";
    }
  }
  revalidatePath("/admin/bookings");
  revalidatePath("/admin");
  revalidatePath("/admin/events");
  redirect("/admin/bookings?" + (result === "paid" ? "paid=" + id : "checked=" + id + "&r=" + result) + "#b-" + id);
}

export default async function BookingsPage({ searchParams }) {
  // Lazy sweep: release any holds whose 3-day window has lapsed (a cron would do
  // this in production). Notifies affected clients.
  await releaseExpiredHolds();

  const spaceFilter = searchParams?.space || "";
  const focus = Number(searchParams?.focus) || 0;
  // Everything that lives on the calendar / has moved past the request stage.
  const all = listBookings(spaceFilter ? { space: spaceFilter } : {}).filter(
    (b) => b.status !== "pending" && b.status !== "denied"
  );

  return (
    <div>
      <PageHeader title="Bookings" subtitle="Held, confirmed, and past bookings." />

      {/* Space filter */}
      <div className="mb-6 inline-flex flex-wrap gap-1 rounded-full border border-line bg-paper p-1">
        <FilterPill href="/admin/bookings" active={!spaceFilter}>
          All spaces
        </FilterPill>
        {SPACES.map((s) => (
          <FilterPill
            key={s.id}
            href={`/admin/bookings?space=${s.id}`}
            active={spaceFilter === s.id}
          >
            {s.name}
          </FilterPill>
        ))}
      </div>

      {all.length === 0 ? (
        <Card pad="lg" className="py-12 text-center text-ink-muted">
          No bookings yet. Approve a request to place a hold on the calendar.
        </Card>
      ) : (
        <Card pad="sm">
          <DataTable
            columns={["Date", "Space", "Client", "Status", "Payment", "Total", "Action"]}
            minWidth={680}
          >
            {all.map((b) => (
              <Tr key={b.id} id={`b-${b.id}`} className={focus === b.id ? "bg-verde/40" : ""}>
                <Td>
                  <div className="font-medium text-ink">{formatDate(b.date)}</div>
                  <div className="text-xs text-ink-muted">
                    {formatTime(b.start_time)} · {b.hours}h
                  </div>
                </Td>
                <Td>{spaceName(b.space)}</Td>
                <Td>
                  <Link
                    href={`/admin/bookings?${spaceFilter ? `space=${spaceFilter}&` : ""}b=${b.id}`}
                    className="font-medium text-ink hover:text-verde-deep hover:underline"
                    scroll={false}
                  >
                    {b.client_name}
                  </Link>
                  <div className="text-xs text-ink-muted">{b.client_email}</div>
                </Td>
                <Td>
                  <Badge status={b.status} />
                </Td>
                <Td className="capitalize">
                  {b.payment_status || "unpaid"}
                  {b.status === "held" && b.hold_expires_at ? (
                    <div className="text-xs text-ink-muted">
                      holds until {formatDate(b.hold_expires_at.slice(0, 10))}
                    </div>
                  ) : null}
                </Td>
                <Td className="text-right font-medium text-ink">{formatMoney(b.total)}</Td>
                <Td className="text-right">
                  {b.status === "held" ? (
                    <div className="flex flex-col items-end gap-1.5">
                      {b.square_invoice_id ? (
                        <form action={checkPayment}>
                          <input type="hidden" name="id" value={b.id} />
                          <Button type="submit" variant="ghost" size="sm">
                            Check for payment
                          </Button>
                        </form>
                      ) : null}
                      <form action={markPaid}>
                        <input type="hidden" name="id" value={b.id} />
                        <Button type="submit" variant="accent" size="sm">
                          Mark as paid
                        </Button>
                      </form>
                      {b.payment_link ? (
                        <a
                          href={b.payment_link}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-verde-deep hover:underline"
                        >
                          Open invoice ↗
                        </a>
                      ) : null}
                      <Link
                        href={`/admin/bookings/${b.id}/cancel`}
                        className="text-xs font-medium text-rust hover:underline"
                      >
                        Cancel booking
                      </Link>
                    </div>
                  ) : b.status === "confirmed" ? (
                    <Button href={`/admin/bookings/${b.id}/cancel`} variant="ghost" size="sm">
                      Cancel booking
                    </Button>
                  ) : (
                    <span className="text-xs text-ink-muted">—</span>
                  )}
                </Td>
              </Tr>
            ))}
          </DataTable>
        </Card>
      )}
    </div>
  );
}

function FilterPill({ href, active, children }) {
  return (
    <Link
      href={href}
      className={cx(
        "rounded-full px-4 py-1.5 text-sm font-semibold transition",
        active ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper-dim hover:text-ink"
      )}
    >
      {children}
    </Link>
  );
}

import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  listBookings,
  getBooking,
  findRestoreConflict,
  restoreBooking,
} from "@/lib/bookings.js";
import { spaceName, formatDate, formatTime, formatMoney } from "@/lib/constants.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import Card from "@/components/admin/ui/Card.js";
import Badge from "@/components/admin/ui/Badge.js";
import Button from "@/components/admin/ui/Button.js";
import { DataTable, Tr, Td } from "@/components/admin/ui/DataTable.js";
import { cx } from "@/components/admin/ui/cx.js";

export const metadata = { title: "All Requests" };

const FILTERS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "held", label: "Held" },
  { key: "confirmed", label: "Confirmed" },
  { key: "completed", label: "Completed" },
  { key: "denied", label: "Denied" },
  { key: "cancelled", label: "Cancelled" },
  { key: "expired", label: "Expired" },
];

// Restore a denied booking. Blocks (with a toast) if its buffered slot now
// conflicts with another held/confirmed booking; never silently double-books.
async function restore(formData) {
  "use server";
  const id = Number(formData.get("id"));
  const to = formData.get("to") === "held" ? "held" : "pending";
  const booking = getBooking(id);
  if (!booking) redirect("/admin/all-requests");

  const conflict = findRestoreConflict(booking);
  if (conflict) {
    const msg = `Can't restore — that slot now conflicts with ${conflict.client_name} on ${formatDate(conflict.date)} at ${formatTime(conflict.start_time)} (${spaceName(conflict.space)}). Resolve that booking first.`;
    redirect(
      "/admin/all-requests?status=denied&toast=" +
        encodeURIComponent(msg) +
        "&toastType=error"
    );
  }

  restoreBooking(id, to);
  revalidatePath("/admin/all-requests");
  revalidatePath("/admin/requests");
  revalidatePath("/admin/bookings");
  revalidatePath("/admin");
  redirect(
    "/admin/all-requests?toast=" +
      encodeURIComponent(
        `Booking #${id} restored to ${to === "held" ? "held (approved)" : "pending"}.`
      ) +
      "&toastType=success"
  );
}

export default function AllRequestsPage({ searchParams }) {
  const status = searchParams?.status || "all";
  const sort = searchParams?.sort === "date_asc" ? "date_asc" : "date_desc";
  const rows = listBookings({ status: status === "all" ? undefined : status, sort });

  const otherSort = sort === "date_desc" ? "date_asc" : "date_desc";
  const qs = (next) => {
    const p = new URLSearchParams();
    if (next.status && next.status !== "all") p.set("status", next.status);
    if (next.sort) p.set("sort", next.sort);
    const s = p.toString();
    return "/admin/all-requests" + (s ? `?${s}` : "");
  };

  return (
    <div>
      <PageHeader
        title="All Requests"
        subtitle="Every booking ever made — including denied and cancelled — kept permanently for your records. Restore a denied booking, or open one to cancel it."
      />

      {/* Status filter */}
      <div className="mb-5 flex flex-wrap gap-1 rounded-full border border-line bg-paper p-1">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={qs({ status: f.key, sort })}
            className={cx(
              "rounded-full px-3.5 py-1.5 text-sm font-semibold transition",
              status === f.key
                ? "bg-ink text-paper"
                : "text-ink-soft hover:bg-paper-dim hover:text-ink"
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <Card pad="lg" className="py-12 text-center text-ink-muted">
          No bookings match this filter.
        </Card>
      ) : (
        <Card pad="sm">
          <DataTable
            columns={[
              <Link key="d" href={qs({ status, sort: otherSort })} className="inline-flex items-center gap-1 hover:text-ink">
                Date {sort === "date_desc" ? "↓" : "↑"}
              </Link>,
              "Client",
              "Space",
              "Time",
              "Status",
              "Total",
              "Action",
            ]}
            minWidth={760}
          >
            {rows.map((b) => {
              const cancelled = b.status === "cancelled";
              return (
                <Tr key={b.id} className={cancelled ? "opacity-55" : ""}>
                  <Td className="whitespace-nowrap font-medium text-ink">
                    {formatDate(b.date)}
                  </Td>
                  <Td>
                    <div className={cancelled ? "text-ink-soft line-through" : "text-ink"}>
                      {b.client_name}
                    </div>
                    <div className="text-xs text-ink-muted">{b.client_email}</div>
                  </Td>
                  <Td>{spaceName(b.space)}</Td>
                  <Td className="whitespace-nowrap">
                    {formatTime(b.start_time)} · {b.hours}h
                  </Td>
                  <Td>
                    <Badge status={b.status} />
                    {cancelled && b.refund_type && b.refund_type !== "none" ? (
                      <div className="mt-0.5 text-xs text-ink-muted">
                        refunded {formatMoney(b.refund_amount)}
                      </div>
                    ) : null}
                  </Td>
                  <Td className="text-right font-medium text-ink">{formatMoney(b.total)}</Td>
                  <Td className="text-right">
                    {b.status === "denied" ? (
                      <form action={restore} className="flex items-center justify-end gap-1.5">
                        <input type="hidden" name="id" value={b.id} />
                        <select
                          name="to"
                          defaultValue="pending"
                          className="rounded-lg border border-line bg-paper px-2 py-1 text-xs text-ink"
                          title="Restore as"
                        >
                          <option value="pending">→ Pending</option>
                          <option value="held">→ Held (approved)</option>
                        </select>
                        <Button type="submit" variant="ghost" size="sm">
                          Restore
                        </Button>
                      </form>
                    ) : b.status === "held" || b.status === "confirmed" ? (
                      <Button href={`/admin/bookings/${b.id}/cancel`} variant="ghost" size="sm">
                        Cancel
                      </Button>
                    ) : (
                      <span className="text-xs text-ink-muted">—</span>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </DataTable>
        </Card>
      )}
    </div>
  );
}

import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  listBookings,
  getBooking,
  findRestoreConflict,
  restoreBooking,
} from "@/lib/bookings.js";
import { logActivity } from "@/lib/activity.js";
import { getActor } from "@/lib/auth.js";
import { SPACES, spaceName, formatDate, formatDateShort, formatTime, formatMoney } from "@/lib/constants.js";
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
  const actor = await getActor();
  logActivity({
    bookingId: id,
    eventType: "restored",
    description: `Restored from denied → ${to === "held" ? "held (approved)" : "pending"}`,
    metadata: { to },
    ...actor,
  });
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
  const q = (searchParams?.q || "").toString();
  const space = (searchParams?.space || "").toString();
  const from = (searchParams?.from || "").toString();
  const to = (searchParams?.to || "").toString();
  const rows = listBookings({
    status: status === "all" ? undefined : status,
    sort,
    q,
    space: space || undefined,
    from: from || undefined,
    to: to || undefined,
  });
  const hasFilters = q || space || from || to;

  const otherSort = sort === "date_desc" ? "date_asc" : "date_desc";
  const current = { status, sort, q, space, from, to };
  const qs = (next = {}) => {
    const m = { ...current, ...next };
    const p = new URLSearchParams();
    if (m.status && m.status !== "all") p.set("status", m.status);
    if (m.sort) p.set("sort", m.sort);
    if (m.q) p.set("q", m.q);
    if (m.space) p.set("space", m.space);
    if (m.from) p.set("from", m.from);
    if (m.to) p.set("to", m.to);
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

      {/* Search + space + date filters (GET; status/sort preserved via hidden inputs) */}
      <form method="get" className="mb-5 flex flex-wrap items-end gap-3">
        {status !== "all" ? <input type="hidden" name="status" value={status} /> : null}
        <input type="hidden" name="sort" value={sort} />
        <div className="min-w-[12rem] flex-1">
          <label className="label" htmlFor="q">Search client</label>
          <input id="q" name="q" defaultValue={q} className="field" placeholder="Name or email" />
        </div>
        <div>
          <label className="label" htmlFor="space">Space</label>
          <select id="space" name="space" defaultValue={space} className="field">
            <option value="">All spaces</option>
            {SPACES.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="from">From</label>
          <input id="from" name="from" type="date" defaultValue={from} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="to">To</label>
          <input id="to" name="to" type="date" defaultValue={to} className="field" />
        </div>
        <Button type="submit" variant="ghost">Filter</Button>
        {hasFilters ? (
          <Button href={qs({ q: "", space: "", from: "", to: "" })} variant="subtle">Clear</Button>
        ) : null}
      </form>

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
            minWidth={700}
          >
            {rows.map((b) => {
              const cancelled = b.status === "cancelled";
              const drawerHref = `${qs({ status, sort })}${qs({ status, sort }).includes("?") ? "&" : "?"}b=${b.id}`;
              return (
                <Tr key={b.id} className={cancelled ? "opacity-55" : ""}>
                  <Td className="whitespace-nowrap font-medium text-ink">
                    {formatDateShort(b.date)}
                  </Td>
                  <Td>
                    <div className={cancelled ? "text-ink-soft line-through" : "text-ink"}>
                      {b.client_name}
                    </div>
                    <div className="text-xs text-ink-muted">{b.client_email}</div>
                    {b.series_id ? (
                      <div className="text-xs font-medium text-sky-700">
                        Recurring · session {b.series_index}/{b.series_total}
                      </div>
                    ) : null}
                    <Link
                      href={drawerHref}
                      className="mt-0.5 inline-block whitespace-nowrap text-xs font-medium text-verde-deep hover:underline"
                      scroll={false}
                    >
                      View activity →
                    </Link>
                  </Td>
                  <Td className="whitespace-nowrap">{spaceName(b.space).replace("The Alley ", "")}</Td>
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
                      <div className="ml-auto flex w-[132px] flex-col gap-1">
                        <form action={restore}>
                          <input type="hidden" name="id" value={b.id} />
                          <input type="hidden" name="to" value="pending" />
                          <Button type="submit" variant="ghost" size="sm" full className="whitespace-nowrap">
                            Restore → Pending
                          </Button>
                        </form>
                        <form action={restore}>
                          <input type="hidden" name="id" value={b.id} />
                          <input type="hidden" name="to" value="held" />
                          <Button type="submit" variant="subtle" size="sm" full className="whitespace-nowrap">
                            Restore → Held
                          </Button>
                        </form>
                      </div>
                    ) : b.status === "held" || b.status === "confirmed" ? (
                      <Button href={`/admin/bookings/${b.id}/cancel`} variant="ghost" size="sm" className="whitespace-nowrap">
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

import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  listBookings,
  getBooking,
  findRestoreConflict,
  restoreBooking,
  archiveBooking,
  unarchiveBooking,
  keepBookingOnCalendar,
  reArmHold,
} from "@/lib/bookings.js";
import { confirmBookingPaid, releaseExpiredHolds, resendInvoice } from "@/lib/payments.js";
import { listDirectory } from "@/lib/catalog.js";
import { getInvoiceStatus } from "@/lib/square.js";
import { logActivity } from "@/lib/activity.js";
import { getActor, getCurrentUser, canManageBookings, requireBookingManager } from "@/lib/auth.js";
import {
  SPACES,
  DATE_PRESETS,
  DEFAULT_DATE_PRESET,
  resolveDateRange,
  spaceName,
  formatDate,
  formatDateShort,
  formatTime,
  formatMoney,
} from "@/lib/constants.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import Card from "@/components/admin/ui/Card.js";
import Badge from "@/components/admin/ui/Badge.js";
import Button from "@/components/admin/ui/Button.js";
import BookingActionsMenu from "@/components/admin/BookingActionsMenu.js";
import { DataTable, Tr, Td } from "@/components/admin/ui/DataTable.js";
import { cx } from "@/components/admin/ui/cx.js";

export const metadata = { title: "Bookings" };

// Status filters. "archived" is not a status — it's the junk drawer, showing
// archived rows of every status (they're hidden from all the other filters).
const FILTERS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "held", label: "Held" },
  { key: "reserved", label: "Reserved" },
  { key: "confirmed", label: "Confirmed" },
  { key: "completed", label: "Completed" },
  { key: "denied", label: "Denied" },
  { key: "cancelled", label: "Cancelled" },
  { key: "expired", label: "Expired" },
  { key: "archived", label: "Archived" },
];

// Filters that are inherently about the past — these default to "All time"
// rather than "Upcoming", which would leave them looking empty.
const HISTORICAL_STATUSES = new Set([
  "archived",
  "cancelled",
  "denied",
  "expired",
  "completed",
]);

function refresh() {
  revalidatePath("/admin/bookings");
  revalidatePath("/admin/requests");
  revalidatePath("/admin");
  revalidatePath("/admin/events");
}

// Every booking action here moves money or state, so it's owner/admin only.
// A limited user reaching an action (stale page, crafted POST) is turned away.
const NO_PERMISSION = "You don't have permission to manage bookings.";

// Preserve the caller's filters across a server action, so acting on a row
// doesn't dump the owner back to an unfiltered list.
function backTo(formData, extra = {}) {
  const p = new URLSearchParams();
  for (const k of ["status", "sort", "q", "space", "preset", "from", "to"]) {
    const v = formData.get(k);
    if (v) p.set(k, String(v));
  }
  for (const [k, v] of Object.entries(extra)) if (v) p.set(k, String(v));
  const s = p.toString();
  return "/admin/bookings" + (s ? `?${s}` : "");
}

async function markPaid(formData) {
  "use server";
  if (!(await requireBookingManager())) redirect(backTo(formData, { toast: NO_PERMISSION, toastType: "error" }));
  const id = Number(formData.get("id"));
  await confirmBookingPaid(id, await getActor());
  refresh();
  redirect(backTo(formData, { toast: `Booking #${id} marked as paid.`, toastType: "success" }));
}

// Override: keep an unpaid hold on the calendar (stop it auto-expiring) while a
// deal is worked out, or re-arm the expiry to undo it.
async function keepOnCalendar(formData) {
  "use server";
  if (!(await requireBookingManager())) redirect(backTo(formData, { toast: NO_PERMISSION, toastType: "error" }));
  const id = Number(formData.get("id"));
  const rearm = formData.get("rearm") === "1";
  const actor = await getActor();
  if (rearm) {
    reArmHold(id);
    logActivity({ bookingId: id, eventType: "hold_rearmed", description: "Payment window re-armed — hold can expire again", ...actor });
  } else {
    keepBookingOnCalendar(id);
    logActivity({ bookingId: id, eventType: "hold_kept", description: "Kept on the calendar — hold won't expire (deal)", ...actor });
  }
  refresh();
  redirect(backTo(formData, {
    toast: rearm ? `Booking #${id} will expire normally again.` : `Booking #${id} kept on the calendar — it won't expire.`,
    toastType: "success",
  }));
}

// Re-email the client their existing payment link.
async function resend(formData) {
  "use server";
  if (!(await requireBookingManager())) redirect(backTo(formData, { toast: NO_PERMISSION, toastType: "error" }));
  const id = Number(formData.get("id"));
  const result = await resendInvoice(id, await getActor());
  const toast =
    result?.error === "no_invoice"
      ? `Booking #${id} has no invoice to resend — approve it or reissue one first.`
      : result?.error === "already_paid"
        ? `Booking #${id} is already paid.`
        : result?.error
          ? `Couldn't resend booking #${id}.`
          : `Invoice resent to ${result.booking.client_email}.`;
  refresh();
  redirect(backTo(formData, { toast, toastType: result?.error ? "error" : "success" }));
}

// Ask Square whether the invoice has been paid; if so, confirm the booking.
async function checkPayment(formData) {
  "use server";
  if (!(await requireBookingManager())) redirect(backTo(formData, { toast: NO_PERMISSION, toastType: "error" }));
  const id = Number(formData.get("id"));
  const b = getBooking(id);
  let toast = "No payment recorded yet.";
  let toastType = "neutral";
  if (b?.square_invoice_id) {
    try {
      const status = await getInvoiceStatus(b.square_invoice_id);
      if (status === "paid") {
        await confirmBookingPaid(id, await getActor());
        toast = `Payment found — booking #${id} is confirmed.`;
        toastType = "success";
      }
    } catch (err) {
      console.error("[bookings] check payment error:", err.message);
      toast = `Couldn't reach Square: ${err.message}`;
      toastType = "error";
    }
  }
  refresh();
  redirect(backTo(formData, { toast, toastType }));
}

// Restore a denied booking. Blocks (with a toast) if its buffered slot now
// conflicts with another held/confirmed booking; never silently double-books.
async function restore(formData) {
  "use server";
  if (!(await requireBookingManager())) redirect(backTo(formData, { toast: NO_PERMISSION, toastType: "error" }));
  const id = Number(formData.get("id"));
  const to = formData.get("to") === "held" ? "held" : "pending";
  const booking = getBooking(id);
  if (!booking) redirect("/admin/bookings");

  const conflict = findRestoreConflict(booking);
  if (conflict) {
    redirect(
      backTo(formData, {
        toast: `Can't restore — that slot now conflicts with ${conflict.client_name} on ${formatDate(conflict.date)} at ${formatTime(conflict.start_time)} (${spaceName(conflict.space)}). Resolve that booking first.`,
        toastType: "error",
      })
    );
  }

  restoreBooking(id, to);
  logActivity({
    bookingId: id,
    eventType: "restored",
    description: `Restored from denied → ${to === "held" ? "held (approved)" : "pending"}`,
    metadata: { to },
    ...(await getActor()),
  });
  refresh();
  redirect(
    backTo(formData, {
      toast: `Booking #${id} restored to ${to === "held" ? "held (approved)" : "pending"}.`,
      toastType: "success",
    })
  );
}

async function archive(formData) {
  "use server";
  if (!(await requireBookingManager())) redirect(backTo(formData, { toast: NO_PERMISSION, toastType: "error" }));
  const id = Number(formData.get("id"));
  const on = formData.get("on") !== "0";
  const actor = await getActor();
  if (on) archiveBooking(id);
  else unarchiveBooking(id);
  logActivity({
    bookingId: id,
    eventType: on ? "archived" : "unarchived",
    description: on ? "Archived — hidden from the bookings list" : "Restored from archive",
    ...actor,
  });
  refresh();
  redirect(
    backTo(formData, {
      toast: on
        ? `Booking #${id} archived. Find it under the Archived filter.`
        : `Booking #${id} is back in the list.`,
      toastType: "success",
    })
  );
}

export default async function BookingsPage({ searchParams }) {
  const canManage = canManageBookings(await getCurrentUser());

  // Lazy sweep: release any holds whose payment window has lapsed (a cron does
  // this in production too). Notifies affected clients.
  await releaseExpiredHolds();

  const status = searchParams?.status || "all";
  const sort = searchParams?.sort === "date_desc" ? "date_desc" : "date_asc";
  const q = (searchParams?.q || "").toString();
  const space = (searchParams?.space || "").toString();
  const customFrom = (searchParams?.from || "").toString();
  const customTo = (searchParams?.to || "").toString();

  // The date filter defaults to "upcoming" so finished events stay out of the
  // way — but the retrospective filters are about the past by definition, and
  // pairing them with "upcoming" would show a permanently empty list. Only an
  // explicit ?preset overrides this, so switching filters doesn't carry an
  // implied range along with it.
  const explicitPreset = (searchParams?.preset || "").toString();
  const defaultPreset = HISTORICAL_STATUSES.has(status) ? "all" : DEFAULT_DATE_PRESET;
  const preset = explicitPreset || defaultPreset;

  const { from, to } = resolveDateRange(preset, { from: customFrom, to: customTo });
  const archived = status === "archived";

  const rows = listBookings({
    status: archived || status === "all" ? undefined : status,
    sort,
    q,
    space: space || undefined,
    from: from || undefined,
    to: to || undefined,
    archived,
  });

  // `preset` here is the EXPLICIT one: links carry a range only when the owner
  // actually chose it, so each status keeps its own sensible default.
  const current = { status, sort, q, space, preset: explicitPreset, from: customFrom, to: customTo };
  const qs = (next = {}) => {
    const m = { ...current, ...next };
    const p = new URLSearchParams();
    if (m.status && m.status !== "all") p.set("status", m.status);
    if (m.sort && m.sort !== "date_asc") p.set("sort", m.sort);
    if (m.q) p.set("q", m.q);
    if (m.space) p.set("space", m.space);
    if (m.preset) p.set("preset", m.preset);
    if (m.preset === "custom") {
      if (m.from) p.set("from", m.from);
      if (m.to) p.set("to", m.to);
    }
    const s = p.toString();
    return "/admin/bookings" + (s ? `?${s}` : "");
  };

  // Tenant names for the attribution tag (the directory is small — one read).
  const tenantName = Object.fromEntries(listDirectory().map((t) => [t.id, t.business_name]));

  const otherSort = sort === "date_asc" ? "date_desc" : "date_asc";
  const presetLabel = DATE_PRESETS.find((p) => p.key === preset)?.label || "Upcoming";
  const isFiltered = q || space || (explicitPreset && explicitPreset !== defaultPreset);

  // Carried through every row action so acting on a booking returns you to the
  // same filtered view.
  const filterValues = {
    status,
    sort,
    q,
    space,
    preset,
    from: customFrom,
    to: customTo,
  };

  return (
    <div>
      <PageHeader
        title="Bookings"
        subtitle="Every booking — pending, on the calendar, and past. Nothing is ever deleted; archive what you don't want to see."
      />

      {/* Status filter. Ten filters can't sit on one row on a phone, so the
          container is a rounded block rather than a full-radius pill — a pill
          radius wrapped around three rows reads as a mistake. The filters
          themselves stay pills. */}
      <div className="mb-5 flex flex-wrap gap-1 rounded-2xl border border-line bg-paper p-1">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={qs({ status: f.key })}
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

      {/* Search + space + date range (GET; status/sort preserved via hidden inputs) */}
      <form method="get" className="mb-5 flex flex-wrap items-end gap-3">
        {status !== "all" ? <input type="hidden" name="status" value={status} /> : null}
        {sort !== "date_asc" ? <input type="hidden" name="sort" value={sort} /> : null}
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
          <label className="label" htmlFor="preset">Dates</label>
          <select id="preset" name="preset" defaultValue={preset} className="field">
            {DATE_PRESETS.map((p) => (
              <option key={p.key} value={p.key}>{p.label}</option>
            ))}
          </select>
        </div>
        {/* Only rendered for "Custom…" — otherwise the preset supplies the range
            and these would look editable while doing nothing. */}
        {preset === "custom" ? (
          <>
            <div>
              <label className="label" htmlFor="from">From</label>
              <input id="from" name="from" type="date" defaultValue={customFrom} className="field" />
            </div>
            <div>
              <label className="label" htmlFor="to">To</label>
              <input id="to" name="to" type="date" defaultValue={customTo} className="field" />
            </div>
          </>
        ) : null}
        <Button type="submit" variant="ghost">Filter</Button>
        {isFiltered ? (
          <Button href={qs({ q: "", space: "", preset: "", from: "", to: "" })} variant="subtle">
            Clear
          </Button>
        ) : null}
      </form>

      {rows.length === 0 ? (
        <Card pad="lg" className="py-12 text-center text-ink-muted">
          {archived
            ? "Nothing archived."
            : `No bookings match this filter${preset !== "all" ? ` in “${presetLabel}”` : ""}.`}
          {preset !== "all" && !archived ? (
            <div className="mt-2 text-sm">
              <Link href={qs({ preset: "all" })} className="font-medium text-verde-deep hover:underline">
                Search all time instead →
              </Link>
            </div>
          ) : null}
        </Card>
      ) : (
        <Card pad="sm">
          <DataTable
            columns={[
              <Link key="d" href={qs({ sort: otherSort })} className="inline-flex items-center gap-1 hover:text-ink">
                Date {sort === "date_asc" ? "↑" : "↓"}
              </Link>,
              "Client",
              "Space",
              "Status",
              "Payment",
              "Total",
              "",
            ]}
            minWidth={620}
            // Pin the ⋯ column to the right edge. The table scrolls sideways on
            // a phone, which otherwise parks every row action off-screen.
            className="[&_tr>*:last-child]:sticky [&_tr>*:last-child]:right-0 [&_tr>*:last-child]:z-10 [&_tr>*:last-child]:bg-paper [&_tr>*:last-child]:shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.08)]"
          >
            {rows.map((b) => {
              const dim = b.status === "cancelled" || b.archived;
              const comped = Number(b.total) === 0;
              return (
                <Tr key={b.id} id={`b-${b.id}`} className={dim ? "opacity-55" : ""}>
                  <Td>
                    <div className="whitespace-nowrap font-medium text-ink">{formatDateShort(b.date)}</div>
                    <div className="text-xs text-ink-muted">
                      {formatTime(b.start_time)} · {b.hours}h
                    </div>
                  </Td>
                  <Td>
                    <div className={dim ? "text-ink-soft line-through" : "font-medium text-ink"}>
                      {b.client_name}
                    </div>
                    <div className="text-xs text-ink-muted">{b.client_email}</div>
                    {b.tenant_id && tenantName[b.tenant_id] ? (
                      <div className="text-xs font-medium text-verde-deep">
                        Tenant · {tenantName[b.tenant_id]}
                      </div>
                    ) : null}
                    {b.series_id ? (
                      <div className="text-xs font-medium text-sky-700">
                        Recurring · session {b.series_index}/{b.series_total}
                      </div>
                    ) : null}
                    <Link
                      href={`${qs()}${qs().includes("?") ? "&" : "?"}b=${b.id}`}
                      className="mt-0.5 inline-block whitespace-nowrap text-xs font-medium text-verde-deep hover:underline"
                      scroll={false}
                    >
                      View activity →
                    </Link>
                  </Td>
                  <Td className="whitespace-nowrap">{spaceName(b.space).replace("The Alley ", "")}</Td>
                  <Td>
                    <Badge status={b.status} />
                    {b.status === "cancelled" && b.refund_type && b.refund_type !== "none" ? (
                      <div className="mt-0.5 text-xs text-ink-muted">
                        refunded {formatMoney(b.refund_amount)}
                      </div>
                    ) : null}
                  </Td>
                  <Td className="capitalize">
                    {comped && b.payment_status === "paid" ? (
                      <span className="font-medium text-verde-deep">Free</span>
                    ) : (
                      b.payment_status || "unpaid"
                    )}
                    {b.status === "held" && b.hold_expires_at ? (
                      <div className="text-xs normal-case text-ink-muted">
                        holds until {formatDate(b.hold_expires_at.slice(0, 10))}
                      </div>
                    ) : b.status === "held" ? (
                      <div className="text-xs normal-case font-medium text-verde-deep">
                        Kept on calendar · won’t expire
                      </div>
                    ) : null}
                  </Td>
                  <Td className="text-right font-medium text-ink">{formatMoney(b.total)}</Td>
                  <Td className="text-right">
                    {canManage ? (
                      <BookingActionsMenu
                        booking={b}
                        filters={filterValues}
                        markPaidAction={markPaid}
                        checkPaymentAction={checkPayment}
                        resendAction={resend}
                        keepOnCalendarAction={keepOnCalendar}
                        restoreAction={restore}
                        archiveAction={archive}
                      />
                    ) : b.payment_link ? (
                      <a
                        href={b.payment_link}
                        target="_blank"
                        rel="noreferrer"
                        className="whitespace-nowrap text-xs font-medium text-verde-deep hover:underline"
                      >
                        Invoice ↗
                      </a>
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

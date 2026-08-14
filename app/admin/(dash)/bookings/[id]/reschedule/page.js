import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getBooking, canReschedule, rescheduleNoticeDays } from "@/lib/bookings.js";
import { applyReschedule } from "@/lib/reschedule.js";
import { getActor, getCurrentUser, canManageBookings, requireBookingManager } from "@/lib/auth.js";
import { spaceName, formatDate, formatTime, formatDateShort } from "@/lib/constants.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import Card from "@/components/admin/ui/Card.js";
import Badge from "@/components/admin/ui/Badge.js";
import Button from "@/components/admin/ui/Button.js";
import AdminReschedulePicker from "@/components/admin/AdminReschedulePicker.js";

export const metadata = { title: "Change date" };

async function confirmMove(formData) {
  "use server";
  if (!(await requireBookingManager())) {
    redirect(
      `/admin/bookings?toast=${encodeURIComponent("You don't have permission to change bookings.")}&toastType=error`
    );
  }
  const id = Number(formData.get("id"));
  const date = String(formData.get("date") || "");
  const start_time = String(formData.get("start_time") || "");
  const override = formData.get("override") === "1";
  const notify = formData.get("notify") === "1";

  const res = await applyReschedule(id, { date, start_time }, {
    source: "admin",
    actor: await getActor(),
    override,
    notify,
  });

  if (!res.ok) {
    redirect(
      `/admin/bookings/${id}/reschedule?toast=${encodeURIComponent(res.error)}&toastType=error`
    );
  }
  if (res.noop) {
    redirect(
      `/admin/bookings?toast=${encodeURIComponent("That's already the booked date — nothing changed.")}&toastType=info`
    );
  }

  revalidatePath("/admin/bookings");
  revalidatePath("/admin/calendar");
  revalidatePath("/admin");
  revalidatePath("/calendar");
  revalidatePath("/events");

  const extra = res.warnings?.includes("hold_rearmed")
    ? " Their payment window was re-armed."
    : "";
  redirect(
    `/admin/bookings?status=all&preset=all&focus=${id}&b=${id}&toast=` +
      encodeURIComponent(
        `Moved to ${formatDateShort(res.booking.date)} at ${formatTime(res.booking.start_time)}.${extra}`
      ) +
      "&toastType=success"
  );
}

export default async function ReschedulePage({ params, searchParams }) {
  const id = Number(params.id);
  const booking = getBooking(id);
  if (!booking) redirect("/admin/bookings");

  const user = await getCurrentUser();
  if (!canManageBookings(user)) {
    redirect(
      `/admin/bookings?toast=${encodeURIComponent("You don't have permission to change bookings.")}&toastType=error`
    );
  }

  const gate = canReschedule(booking, { source: "admin" });
  const noticeDays = rescheduleNoticeDays();
  const tooClose = gate.warnings?.includes("too_close");

  return (
    <div>
      <PageHeader
        title="Change date"
        subtitle={`${booking.client_name} · ${spaceName(booking.space)}`}
      />

      {searchParams?.toast ? (
        <div className="mb-4 rounded-2xl border border-rust/30 bg-rust/5 px-4 py-3 text-sm text-rust">
          {searchParams.toast}
        </div>
      ) : null}

      <Card pad="md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-widest text-ink-muted">Currently</div>
            <div className="mt-1 text-lg font-semibold text-ink">
              {formatDate(booking.date)} · {formatTime(booking.start_time)}
            </div>
            <div className="mt-1 text-sm text-ink-muted">
              {spaceName(booking.space)} · {booking.hours} hours · {booking.status}
              {booking.payment_status === "paid" ? " · paid" : ""}
            </div>
          </div>
          <Badge tone={booking.payment_status === "paid" ? "verde" : "gold"}>
            {booking.payment_status === "paid" ? "Paid" : "Unpaid"}
          </Badge>
        </div>
      </Card>

      {!gate.ok ? (
        <Card pad="md" className="mt-4">
          <p className="text-sm text-ink">{gate.error}</p>
          <Link href="/admin/bookings" className="mt-4 inline-block">
            <Button variant="ghost">Back to bookings</Button>
          </Link>
        </Card>
      ) : (
        <form action={confirmMove} className="mt-4 space-y-4">
          <input type="hidden" name="id" value={booking.id} />

          {tooClose ? (
            <div className="rounded-2xl border border-rust/30 bg-rust/5 px-4 py-3">
              <p className="text-sm font-semibold text-rust">
                This event is {gate.daysOut === 0 ? "today" : `only ${gate.daysOut} ${gate.daysOut === 1 ? "day" : "days"} away`}.
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                Clients can&rsquo;t move a booking inside {noticeDays} days — you can, but make sure
                they know, and check nothing else depends on the original date.
              </p>
              <label className="mt-3 flex items-start gap-2 text-sm text-ink">
                <input type="checkbox" name="override" value="1" className="mt-1" required />
                <span>Yes, move it anyway.</span>
              </label>
            </div>
          ) : null}

          <Card pad="md">
            <AdminReschedulePicker booking={{
              id: booking.id,
              space: booking.space,
              hours: Number(booking.hours),
              date: booking.date,
              start_time: booking.start_time,
            }} />
          </Card>

          <Card pad="md">
            <label className="flex items-start gap-2 text-sm text-ink">
              <input type="checkbox" name="notify" value="1" defaultChecked className="mt-1" />
              <span>
                Email {booking.client_name} about the change.
                <span className="block text-xs text-ink-muted">
                  Turn this off if you&rsquo;ve already agreed the new date with them.
                </span>
              </span>
            </label>
          </Card>

          <div className="flex items-center gap-3">
            <Button type="submit">Move the booking</Button>
            <Link href="/admin/bookings" className="text-sm text-ink-muted underline">
              Cancel
            </Link>
          </div>
          <p className="text-xs text-ink-muted">
            The space, length and price don&rsquo;t change, and no invoice is reissued — Square
            invoices carry no event date, so a paid booking stays paid.
          </p>
        </form>
      )}
    </div>
  );
}

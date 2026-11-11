import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getBooking, canReschedule, rescheduleNoticeDays } from "@/lib/bookings.js";
import { applyReschedule } from "@/lib/reschedule.js";
import { getActor, getCurrentUser, canManageBookings, requireBookingManager } from "@/lib/auth.js";
import { spaceName, formatDate, formatTime, formatDateShort, formatMoney } from "@/lib/constants.js";
import { spaceRules } from "@/lib/spaces.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import Card from "@/components/admin/ui/Card.js";
import Badge from "@/components/admin/ui/Badge.js";
import Button from "@/components/admin/ui/Button.js";
import AdminReschedulePicker from "@/components/admin/AdminReschedulePicker.js";

export const metadata = { title: "Change date or time" };

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
  const hours = formData.get("hours");
  const override = formData.get("override") === "1";
  const notify = formData.get("notify") === "1";
  const refund = formData.get("refund") === "1";

  const res = await applyReschedule(id, { date, start_time, hours }, {
    source: "admin",
    actor: await getActor(),
    override,
    notify,
    refund,
  });

  if (!res.ok) {
    redirect(
      `/admin/bookings/${id}/reschedule?toast=${encodeURIComponent(res.error)}&toastType=error`
    );
  }
  if (res.noop) {
    redirect(
      `/admin/bookings?toast=${encodeURIComponent("That's already the booked date and time — nothing changed.")}&toastType=info`
    );
  }

  revalidatePath("/admin/bookings");
  revalidatePath("/admin/calendar");
  revalidatePath("/admin");
  revalidatePath("/calendar");
  revalidatePath("/events");

  const w = res.warnings || [];
  const m = res.money;
  const bits = [];
  if (w.includes("hold_rearmed")) bits.push("Their payment window was re-armed.");
  if (m?.kind === "charge") bits.push(`${notify ? "Emailed them" : "Made"} a Square invoice for ${formatMoney(m.amount)}${notify ? "" : " (not emailed — copy the link from the booking's Details tab)"}.`);
  if (m?.kind === "reissued") bits.push(`Their invoice is now ${formatMoney(m.total)}${notify ? " and the new link was emailed" : " (not emailed)"}.`);
  if (m?.kind === "refund") bits.push(`Refunded ${formatMoney(m.amount)}.`);
  if (m?.kind === "owed_back") bits.push(`${formatMoney(m.amount)} wasn't refunded${w.includes("no_square_payment") ? " — Square has no card payment for it, so pay it back by hand" : w.includes("refund_failed") ? " — Square refused, so do it in Square" : ""}.`);
  if (w.includes("invoice_failed")) bits.push("But Square couldn't make the invoice — charge the difference in Square.");
  if (w.includes("stale_invoice")) bits.push("The OLD Square invoice couldn't be voided — cancel it in Square.");
  if (w.includes("paid_meanwhile")) bits.push("They paid the old invoice in the meantime — charge the difference in Square.");
  const end = (() => {
    const [h, mm] = res.booking.start_time.split(":").map(Number);
    const t = h * 60 + mm + Math.round(Number(res.booking.hours) * 60);
    return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
  })();
  const bad = w.some((x) => ["invoice_failed", "stale_invoice", "paid_meanwhile", "no_square_payment", "refund_failed"].includes(x));
  redirect(
    `/admin/bookings?status=all&preset=all&focus=${id}&b=${id}&toast=` +
      encodeURIComponent(
        `Now ${formatDateShort(res.booking.date)}, ${formatTime(res.booking.start_time)}–${formatTime(end)}. ${bits.join(" ")}`.trim()
      ) +
      `&toastType=${bad ? "neutral" : "success"}`
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
  const rules = spaceRules(booking.space);
  const cur = Number(booking.hours);
  const lengths = [];
  for (let h = 0.5; h <= Math.max(rules.maxHours, cur) + 1e-9; h += 0.5) {
    if (h >= Math.min(rules.minHours, cur) - 1e-9) lengths.push(h);
  }
  const noticeDays = rescheduleNoticeDays();
  const tooClose = gate.warnings?.includes("too_close");

  return (
    <div>
      <PageHeader
        title="Change date or time"
        subtitle={`${booking.client_name} · ${spaceName(booking.space)} · move it, or add or take off time`}
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
              {spaceName(booking.space)} · {booking.hours} hours · {formatMoney(booking.total)} · {booking.status}
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
            <AdminReschedulePicker
              lengths={lengths}
              booking={{
                id: booking.id,
                space: booking.space,
                hours: cur,
                date: booking.date,
                start_time: booking.start_time,
                rate: Number(booking.rate) || 0,
                total: Number(booking.total) || 0,
                paid: booking.payment_status === "paid",
                hasInvoice: Boolean(booking.square_invoice_id || booking.payment_link),
                series: Boolean(booking.series_id),
              }}
            />
          </Card>

          <Card pad="md">
            <label className="flex items-start gap-2 text-sm text-ink">
              <input type="checkbox" name="notify" value="1" defaultChecked className="mt-1" />
              <span>
                Email {booking.client_name} about the change.
                <span className="block text-xs text-ink-muted">
                  It shows the old and new times, and the payment link if there&rsquo;s more to pay. Turn
                  this off if you&rsquo;ve already sorted it with them.
                </span>
              </span>
            </label>
          </Card>

          <div className="flex items-center gap-3">
            <Button type="submit">Save the change</Button>
            <Link href="/admin/bookings" className="text-sm text-ink-muted underline">
              Cancel
            </Link>
          </div>
          <p className="text-xs text-ink-muted">
            Moving the date or start time on its own doesn&rsquo;t touch the price or the invoice. Changing
            how long it runs changes the price: an unpaid invoice is replaced, and a paid booking gets a
            separate invoice for added time (or a refund for time taken off).
          </p>
        </form>
      )}
    </div>
  );
}

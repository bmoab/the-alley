import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser, canManageStaff, requireStaffManager, getActor } from "@/lib/auth.js";
import {
  listEmployees,
  listShifts,
  createShift,
  updateShift,
  deleteShift,
  publishShifts,
  countDrafts,
  copyWeek,
  hoursByEmployee,
  scheduleContext,
  weekStart,
  weekDates,
} from "@/lib/staff.js";
import { logActivity } from "@/lib/activity.js";
import { formatDateShort, shiftDate, venueToday } from "@/lib/constants.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import Card from "@/components/admin/ui/Card.js";
import Button from "@/components/admin/ui/Button.js";
import ScheduleWeek from "@/components/admin/ScheduleWeek.js";

export const metadata = { title: "Schedule" };
export const dynamic = "force-dynamic";

// Kept at module scope: a server action can only close over serializable
// values, so a helper declared inside the component would be undefined here.
function refreshSchedule() {
  revalidatePath("/admin/schedule");
  revalidatePath("/admin/calendar");
  revalidatePath("/staff", "layout");
}

function shiftSummary(s) {
  return `${s.employee_name || "Open shift"} · ${formatDateShort(s.date)} ${s.start_time}–${s.end_time}`;
}

/** The editor's "Covering an event?" select sends "bookingId|eventId". */
function linkFields(formData) {
  const [bookingId, eventId] = String(formData.get("link") || "|").split("|");
  return { booking_id: bookingId || null, event_id: eventId || null };
}

/**
 * Add or edit a shift. Called from the client editor, so it RETURNS a result
 * instead of redirecting — the editor closes itself and refreshes on success,
 * and shows the message in place on an error (e.g. an overlap).
 */
async function saveShift(formData) {
  "use server";
  await requireStaffManager();
  const id = Number(formData.get("id")) || null;
  const me = await getCurrentUser();
  const fields = {
    date: (formData.get("date") || "").toString(),
    employee_id: (formData.get("employee_id") || "").toString() || null,
    start_time: (formData.get("start_time") || "").toString(),
    end_time: (formData.get("end_time") || "").toString(),
    role: (formData.get("role") || "").toString(),
    note: (formData.get("note") || "").toString(),
    ...linkFields(formData),
  };
  try {
    if (id) {
      const { before, after } = updateShift(id, fields);
      logActivity({
        eventType: "shift_updated",
        description: `Shift changed: ${shiftSummary(before)} → ${shiftSummary(after)}`,
        metadata: { shiftId: id },
        ...(await getActor()),
      });
      refreshSchedule();
      return { ok: true, message: after.status === "published" ? "Shift updated — staff can see the change." : "Shift updated." };
    }
    const created = createShift(fields, { createdBy: me?.id ?? null });
    logActivity({
      eventType: "shift_created",
      description: `Shift added: ${shiftSummary(created)}`,
      metadata: { shiftId: created.id },
      ...(await getActor()),
    });
    refreshSchedule();
    return { ok: true, message: "Shift added as a draft — publish the week when it's ready." };
  } catch (err) {
    return { error: err.message || "Couldn't save that shift." };
  }
}

async function removeShift(formData) {
  "use server";
  await requireStaffManager();
  const removed = deleteShift(Number(formData.get("id")));
  if (!removed) return { error: "That shift was already removed." };
  logActivity({
    eventType: "shift_deleted",
    description: `Shift removed: ${shiftSummary(removed)}`,
    metadata: { shiftId: removed.id },
    ...(await getActor()),
  });
  refreshSchedule();
  return { ok: true, message: "Shift removed." };
}

async function publishWeek(formData) {
  "use server";
  await requireStaffManager();
  const start = weekStart((formData.get("week") || "").toString() || venueToday());
  const end = shiftDate(start, { days: 6 });
  const n = publishShifts(start, end);
  if (n) {
    logActivity({
      eventType: "schedule_published",
      description: `Published ${n} shift${n === 1 ? "" : "s"} for the week of ${formatDateShort(start)}`,
      ...(await getActor()),
    });
  }
  refreshSchedule();
  redirect(
    `/admin/schedule?week=${start}&toast=${encodeURIComponent(
      n ? `Published ${n} shift${n === 1 ? "" : "s"} — staff can see them now.` : "Nothing new to publish."
    )}&toastType=${n ? "success" : "neutral"}`
  );
}

async function copyLastWeek(formData) {
  "use server";
  const me = await requireStaffManager();
  const start = weekStart((formData.get("week") || "").toString() || venueToday());
  const n = copyWeek(shiftDate(start, { days: -7 }), start, { createdBy: me.id });
  if (n) {
    logActivity({
      eventType: "schedule_copied",
      description: `Copied ${n} shift${n === 1 ? "" : "s"} from the week before into the week of ${formatDateShort(start)}`,
      ...(await getActor()),
    });
  }
  refreshSchedule();
  redirect(
    `/admin/schedule?week=${start}&toast=${encodeURIComponent(
      n ? `Copied ${n} shift${n === 1 ? "" : "s"} as drafts.` : "Nothing to copy — last week is empty, or it's all here already."
    )}&toastType=${n ? "success" : "neutral"}`
  );
}

export default async function SchedulePage({ searchParams }) {
  const me = await getCurrentUser();
  if (!canManageStaff(me)) redirect("/admin");

  const today = venueToday();
  const start = weekStart(/^\d{4}-\d{2}-\d{2}$/.test(searchParams?.week || "") ? searchParams.week : today);
  const end = shiftDate(start, { days: 6 });
  const dates = weekDates(start);
  const shifts = listShifts({ from: start, to: end });
  const { happenings, closed } = scheduleContext(start, end);
  const employees = listEmployees();
  const drafts = countDrafts(start, end);
  const hours = hoursByEmployee(shifts);
  const openShifts = shifts.filter((s) => !s.employee_id).length;

  const weekLabel = `${formatDateShort(start)} – ${formatDateShort(end)}`;

  return (
    <div>
      <PageHeader
        title="Schedule"
        subtitle="Shifts for the week, with the building's bookings and events alongside. New shifts are drafts until you publish the week — staff only ever see published ones."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button href={`/admin/schedule?week=${shiftDate(start, { days: -7 })}`} variant="ghost" size="sm">
          ← Prev
        </Button>
        <p className="px-1 text-base font-semibold text-ink">{weekLabel}</p>
        <Button href={`/admin/schedule?week=${shiftDate(start, { days: 7 })}`} variant="ghost" size="sm">
          Next →
        </Button>
        {start !== weekStart(today) ? (
          <Button href="/admin/schedule" variant="subtle" size="sm">
            This week
          </Button>
        ) : null}

        <div className="ml-auto flex flex-wrap gap-2">
          <form action={copyLastWeek}>
            <input type="hidden" name="week" value={start} />
            <Button type="submit" variant="ghost" size="sm">Copy last week</Button>
          </form>
          <form action={publishWeek}>
            <input type="hidden" name="week" value={start} />
            <Button type="submit" variant={drafts ? "accent" : "ghost"} size="sm" disabled={!drafts}>
              {drafts ? `Publish ${drafts} draft${drafts === 1 ? "" : "s"}` : "All published"}
            </Button>
          </form>
        </div>
      </div>

      {employees.length === 0 ? (
        <Card pad="md" className="mb-4">
          <p className="text-sm text-ink-soft">
            No employees yet. <Link href="/admin/employees" className="font-semibold text-ink underline">Add someone</Link>{" "}
            to start putting people on shifts — you can still sketch open shifts meanwhile.
          </p>
        </Card>
      ) : null}

      <ScheduleWeek
        dates={dates}
        today={today}
        shifts={shifts}
        happenings={happenings}
        closed={closed}
        employees={employees.map((e) => ({ id: e.id, name: e.name }))}
        editable
        saveShift={saveShift}
        removeShift={removeShift}
      />

      <Card pad="md" className="mt-6">
        <h2 className="text-base font-semibold text-ink">Hours this week</h2>
        {employees.length ? (
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {employees.map((e) => {
              const h = Math.round((hours[e.id] || 0) * 100) / 100;
              return (
                <li key={e.id} className="flex items-center justify-between gap-2 rounded-lg bg-paper-dim px-3 py-2 text-sm">
                  <span className="flex items-center gap-2 text-ink">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: e.color || "#5b6770" }} />
                    {e.name}
                  </span>
                  <span className={h > 40 ? "font-semibold text-rust" : "tabular-nums text-ink-soft"}>
                    {h}h{h > 40 ? " · overtime" : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-ink-muted">—</p>
        )}
        {openShifts ? (
          <p className="mt-3 text-sm text-amber-800">
            {openShifts === 1 ? "1 open shift still needs someone." : `${openShifts} open shifts still need someone.`}
          </p>
        ) : null}
      </Card>
    </div>
  );
}

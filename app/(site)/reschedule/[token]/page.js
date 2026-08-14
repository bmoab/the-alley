import Link from "next/link";
import { revalidatePath } from "next/cache";
import {
  getBookingByRescheduleToken,
  canReschedule,
  rescheduleNoticeDays,
} from "@/lib/bookings.js";
import { applyReschedule } from "@/lib/reschedule.js";
import { spaceRules } from "@/lib/spaces.js";
import { getSettings } from "@/lib/db.js";
import {
  spaceName,
  formatDate,
  formatTime,
  formatDateShort,
  venueToday,
  shiftDate,
} from "@/lib/constants.js";
import RescheduleForm from "@/components/site/RescheduleForm.js";

export const metadata = { title: "Change your date" };

const PHONE = "(435) 512-4608";
const MAILTO = "thealleyoncenter@gmail.com";

/** Shared shell so every state looks like the rest of the site. */
function Page({ children }) {
  return <main className="container-content rs-page">{children}</main>;
}

function NotFound() {
  return (
    <Page>
      <p className="eyebrow">Change your date</p>
      <h1 className="rs-h1">This link isn&rsquo;t valid</h1>
      <p className="lede">
        It may have expired, or the booking may already have been changed. Give us a call on{" "}
        <a href={`tel:${PHONE.replace(/\D/g, "")}`}>{PHONE}</a> or email{" "}
        <a href={`mailto:${MAILTO}`}>{MAILTO}</a> and we&rsquo;ll sort it out.
      </p>
      <Link href="/" className="btn btn--solid rs-back">Back to The Alley</Link>
    </Page>
  );
}

function BookingFacts({ booking }) {
  return (
    <dl className="rs-facts">
      <div><dt>Space</dt><dd>{spaceName(booking.space)}</dd></div>
      <div><dt>Date</dt><dd>{formatDate(booking.date)}</dd></div>
      <div><dt>Time</dt><dd>{formatTime(booking.start_time)} · {booking.hours} hours</dd></div>
    </dl>
  );
}

export default async function ReschedulePage({ params }) {
  const booking = getBookingByRescheduleToken(params.token);
  if (!booking) return <NotFound />;

  const gate = canReschedule(booking, { source: "client" });
  const noticeDays = rescheduleNoticeDays();

  // Anything the client can't self-serve gets the same honest answer: talk to a
  // person. Deliberately no cancel control anywhere on this page — cancelling
  // still goes through Chelsea, exactly as it does today.
  if (!gate.ok) {
    const tooClose = gate.code === "too_close";
    return (
      <Page>
        <p className="eyebrow">Your booking</p>
        <h1 className="rs-h1">
          {tooClose ? "Let's do this one together" : "This booking can't be changed online"}
        </h1>
        <BookingFacts booking={booking} />
        <p className="lede rs-lede">
          {tooClose
            ? `Your event is ${gate.daysOut === 0 ? "today" : `only ${gate.daysOut} ${gate.daysOut === 1 ? "day" : "days"} away`}, and changes inside ${noticeDays} days need a quick conversation so we can make sure everything still works.`
            : gate.error}
        </p>
        <p className="rs-note">
          Call Chelsea on <a href={`tel:${PHONE.replace(/\D/g, "")}`}>{PHONE}</a> or email{" "}
          <a href={`mailto:${MAILTO}`}>{MAILTO}</a>.
        </p>
      </Page>
    );
  }

  const s = getSettings();
  const rules = spaceRules(booking.space);
  const config = {
    rate: rules.rate,
    deposit: rules.deposit,
    minHours: rules.minHours,
    maxHours: rules.maxHours,
    cleanupBuffer: rules.cleanupBufferMinutes / 60,
    openHour: Number(s.open_hour) || 8,
    closeHour: Number(s.close_hour) || 23,
    minLeadHours: Number(s.min_lead_hours) || 0,
  };

  // The earliest day a client may move to is the same notice window they had to
  // clear to get here — greyed out in the calendar rather than rejected later.
  const minDate = shiftDate(venueToday(), { days: noticeDays });

  // Only what the picker needs. The token, email, invoice, payment link and
  // totals deliberately never reach the client bundle.
  const slim = {
    id: booking.id,
    space: booking.space,
    date: booking.date,
    start_time: booking.start_time,
    hours: Number(booking.hours),
  };

  async function submit({ date, start_time }) {
    "use server";
    // Re-resolve from the TOKEN, never from anything the browser posted.
    const b = getBookingByRescheduleToken(params.token);
    if (!b) return { ok: false, error: "This link is no longer valid." };

    const res = await applyReschedule(
      b.id,
      { date, start_time },
      { source: "client", actor: { actorUserId: null, actorName: b.client_name } }
    );
    if (!res.ok) return { ok: false, error: res.error };
    if (res.noop) return { ok: false, error: "That's the date you already have." };

    revalidatePath("/calendar");
    revalidatePath("/events");
    revalidatePath("/admin/bookings");
    revalidatePath("/admin/calendar");
    revalidatePath("/admin");
    return {
      ok: true,
      moved: {
        wasDate: formatDateShort(res.before.date),
        wasTime: formatTime(res.before.start_time),
        nowDate: formatDateShort(res.booking.date),
        nowTime: formatTime(res.booking.start_time),
      },
    };
  }

  return (
    <Page>
      <p className="eyebrow">Change your date</p>
      <h1 className="rs-h1">Hi {booking.client_name.split(/\s+/)[0]} — pick a new day</h1>
      <p className="lede rs-lede">
        Your {spaceName(booking.space)} booking is currently{" "}
        <strong>{formatDate(booking.date)} at {formatTime(booking.start_time)}</strong>. Choose any
        open day below and we&rsquo;ll move it — same space, same {booking.hours} hours, same price.
      </p>

      <RescheduleForm booking={slim} config={config} minDate={minDate} onSubmit={submit} />

      <p className="rs-note rs-foot">
        Need to cancel, or change something other than the date? Please call Chelsea on{" "}
        <a href={`tel:${PHONE.replace(/\D/g, "")}`}>{PHONE}</a> or email{" "}
        <a href={`mailto:${MAILTO}`}>{MAILTO}</a>.
      </p>
    </Page>
  );
}

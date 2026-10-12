import { redirect } from "next/navigation";
import { getSignedInUser } from "@/lib/auth.js";
import {
  getEmployeeForUser,
  listShifts,
  scheduleContext,
  ensureIcsToken,
  shiftHours,
} from "@/lib/staff.js";
import { formatDate, shiftDate, venueToday } from "@/lib/constants.js";
import Card from "@/components/admin/ui/Card.js";
import { fmtRange } from "@/lib/shift-format.js";
import NotSetUp from "@/components/staff/NotSetUp.js";

export const metadata = { title: "My shifts" };

const APP_URL = process.env.APP_URL || "";

export default async function MyShiftsPage() {
  const user = await getSignedInUser();
  if (!user) redirect("/admin/login");
  const employee = getEmployeeForUser(user);
  if (!employee) return <NotSetUp />;

  const today = venueToday();
  const until = shiftDate(today, { days: 42 });
  const shifts = listShifts({ from: today, to: until, employeeId: employee.id, publishedOnly: true });
  const { happenings } = scheduleContext(today, until);
  const token = ensureIcsToken(employee.id);
  const feedUrl = `${APP_URL}/staff/calendar/${token}.ics`;
  const webcalUrl = feedUrl.replace(/^https?:/, "webcal:");

  const next = shifts[0];
  const weekEnd = shiftDate(today, { days: 6 });
  const weekHours = shifts.filter((s) => s.date <= weekEnd).reduce((sum, s) => sum + shiftHours(s), 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Hi, {employee.name.split(" ")[0]}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {shifts.length
            ? `${Math.round(weekHours * 100) / 100} hours scheduled in the next 7 days.`
            : "Nothing on your schedule in the next six weeks."}
        </p>
      </div>

      <p className="rounded-xl border border-line bg-paper-dim px-4 py-3 text-sm text-ink-soft">
        <strong className="text-ink">Clock in and out on the Square register</strong> (or the Square Team app on your
        phone). Your hours and pay stubs are there too.
      </p>

      {/* The few register habits the books depend on — makers are paid from
          what Square records, so these keep their payouts right. */}
      <details className="rounded-xl border border-line bg-paper p-4 text-sm">
        <summary className="cursor-pointer font-semibold text-ink">At the register</summary>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-ink-soft">
          <li>
            <strong className="text-ink">Scan the tag</strong> — the camera button at the right of Square&apos;s search bar.
            No tag? Type the number under the code into search.
          </li>
          <li>
            <strong className="text-ink">Refunds: always item by item.</strong> In Square choose Issue refund, then pick the
            item(s) — never &ldquo;Refund by amount&rdquo;. That&apos;s how the maker&apos;s share comes back off automatically.
          </li>
          <li>
            <strong className="text-ink">Don&apos;t give a maker&apos;s item away</strong> (comp it) — ask Chelsea first. It&apos;s
            the maker&apos;s money.
          </li>
          <li>
            <strong className="text-ink">Never ring up a custom amount</strong> for a tagged item — scan or search it, so the
            sale counts for its maker.
          </li>
        </ul>
      </details>

      {next ? (
        <Card pad="md" className="border-verde-deep/40">
          <p className="text-xs font-semibold uppercase tracking-wider text-verde-deep">
            {next.date === today ? "Today" : "Next shift"}
          </p>
          <p className="mt-1 text-lg font-semibold text-ink">
            {formatDate(next.date)} · {fmtRange(next.start_time, next.end_time)}
          </p>
          {next.role ? <p className="text-sm text-ink-soft">{next.role}</p> : null}
          {next.note ? <p className="mt-1 text-sm italic text-ink-muted">{next.note}</p> : null}
        </Card>
      ) : null}

      {shifts.length > 1 ? (
        <h2 className="pt-1 text-sm font-semibold uppercase tracking-wider text-ink-muted">After that</h2>
      ) : null}
      {shifts.length > 1 ? (
        <ul className="space-y-2">
          {shifts.slice(1).map((s) => {
            const sameDay = happenings.filter((h) => h.date === s.date);
            return (
              <li key={s.id} className="rounded-xl border border-line bg-paper p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold text-ink">{formatDate(s.date)}</p>
                  <p className="text-sm tabular-nums text-ink-soft">
                    {fmtRange(s.start_time, s.end_time)} · {Math.round(shiftHours(s) * 100) / 100}h
                  </p>
                </div>
                {s.role ? <p className="text-sm text-ink-soft">{s.role}</p> : null}
                {s.note ? <p className="text-sm italic text-ink-muted">{s.note}</p> : null}
                {sameDay.length ? (
                  <p className="mt-2 text-xs text-ink-muted">
                    Happening that day:{" "}
                    {sameDay.map((h) => `${fmtRange(h.start, h.end)} ${h.title} (${h.room})`).join(" · ")}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      <Card pad="md">
        <h2 className="text-base font-semibold text-ink">Put your shifts in your phone&apos;s calendar</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Subscribe once and new or changed shifts show up on their own.{" "}
          <a href={webcalUrl} className="font-semibold text-ink underline">
            Tap here on your phone
          </a>
          , or paste this link into Google Calendar → Other calendars → From URL:
        </p>
        <code className="mt-2 block break-all rounded bg-paper-dim p-2 text-xs text-ink-soft">{feedUrl}</code>
        <p className="mt-2 text-xs text-ink-muted">This link is just for you — don&apos;t share it.</p>
      </Card>
    </div>
  );
}

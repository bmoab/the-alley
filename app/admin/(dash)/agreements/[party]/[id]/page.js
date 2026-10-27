import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin, getActor, getCurrentUser } from "@/lib/auth.js";
import { REMINDERS, getParty, reminderKindFor, reminderDraft, reminderHistory, recordReminder } from "@/lib/agreement-reminders.js";
import { emailExhibitorReminder } from "@/lib/email.js";
import { logActivity } from "@/lib/activity.js";
import { formatDate, venueDayOf, formatDateShort } from "@/lib/constants.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import Card from "@/components/admin/ui/Card.js";
import Button from "@/components/admin/ui/Button.js";

export const metadata = { title: "Agreement reminder" };
export const dynamic = "force-dynamic";

const home = (msg, type = "success") => `/admin?toast=${encodeURIComponent(msg)}&toastType=${type}`;

function partyFrom(formData) {
  return getParty(String(formData.get("party")), Number(formData.get("id")));
}

async function send(formData) {
  "use server";
  await requireAdmin();
  const actor = await getActor();
  const p = partyFrom(formData);
  const kind = String(formData.get("kind"));
  if (!p?.email || !p.endsOn || !REMINDERS[kind]) redirect(home("That reminder can't be sent — check their email and end date.", "error"));
  const here = `/admin/agreements/${p.party}/${p.id}?kind=${kind}`;
  const subject = String(formData.get("subject") || "").trim().slice(0, 200);
  const message = String(formData.get("message") || "").trim().slice(0, 5000);
  if (!subject || !message) redirect(`${here}&toast=${encodeURIComponent("Add a subject and a message.")}&toastType=error`);
  const result = await emailExhibitorReminder({ to: p.email, subject, message });
  if (!result?.ok) redirect(`${here}&toast=${encodeURIComponent("The email didn't go through — try again in a minute.")}&toastType=error`);
  recordReminder({ party: p.party, partyId: p.id, kind, endsOn: p.endsOn, subject, sentTo: p.email, by: actor.actorName });
  logActivity({ eventType: "exhibitor_reminder_sent", description: `${REMINDERS[kind].label} sent to ${p.name}`, ...actor });
  revalidatePath("/admin");
  redirect(home(`Reminder sent to ${p.name}.`));
}

async function skip(formData) {
  "use server";
  await requireAdmin();
  const actor = await getActor();
  const p = partyFrom(formData);
  const kind = String(formData.get("kind"));
  if (!p?.endsOn || !REMINDERS[kind]) redirect(home("Nothing to mark.", "error"));
  recordReminder({ party: p.party, partyId: p.id, kind, endsOn: p.endsOn, skipped: true, by: actor.actorName });
  logActivity({ eventType: "exhibitor_reminder_skipped", description: `${REMINDERS[kind].label} for ${p.name} handled without email`, ...actor });
  revalidatePath("/admin");
  redirect(home(`Marked done for ${p.name}.`, "neutral"));
}

/** Read over the pre-written reminder, change anything, and send it. */
export default async function AgreementReminderPage({ params, searchParams }) {
  await requireAdmin();
  const p = getParty(params.party, Number(params.id));
  if (!p) notFound();
  const kind = REMINDERS[searchParams?.kind] ? searchParams.kind : reminderKindFor(p.endsOn) || "month";
  const me = await getCurrentUser();
  const draft = p.endsOn ? reminderDraft(p, kind, { senderName: me?.name || "" }) : null;
  const history = reminderHistory(p.party, p.id);

  return (
    <div className="max-w-3xl">
      <PageHeader
        eyebrow="Consignment agreement"
        title={`Remind ${p.name}`}
        subtitle={
          p.endsOn
            ? `Their consignment agreement ends ${formatDate(p.endsOn)}. This is the ${REMINDERS[kind].label} — read it over, change anything you like, then send.`
            : "Add the date their agreement ends first."
        }
      />
      {!p.email ? (
        <p className="mb-4 rounded-lg border border-rust/30 bg-rust/10 px-3 py-2 text-sm text-rust">
          There&apos;s no email for {p.name}.{" "}
          <Link href={p.href} className="font-semibold underline">Add one</Link>, or reach them another way and tap &ldquo;Done another way&rdquo;.
        </p>
      ) : null}
      {draft ? (
        <Card pad="lg">
          <form action={send} className="space-y-4">
            <input type="hidden" name="party" value={p.party} />
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="kind" value={kind} />
            <p className="text-sm text-ink-soft">
              To <strong className="text-ink">{p.email || "—"}</strong>. A copy goes in their Alley account&apos;s Activity, and their reply comes to the shop&apos;s email.
            </p>
            <div>
              <label className="label">Subject</label>
              <input name="subject" defaultValue={draft.subject} required className="field" />
            </div>
            <div>
              <label className="label">Message</label>
              <textarea name="message" defaultValue={draft.message} required rows={16} className="field !h-auto py-3 leading-relaxed" />
              <p className="mt-1 text-xs text-ink-muted">The shop&apos;s email and phone are added under your name.</p>
            </div>
            <Button type="submit" variant="accent" disabled={!p.email}>Send reminder</Button>
          </form>
          <form action={skip} className="mt-3 border-t border-line pt-3">
            <input type="hidden" name="party" value={p.party} />
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="kind" value={kind} />
            <Button type="submit" variant="ghost" size="sm">Done another way (called or told them in person)</Button>
          </form>
        </Card>
      ) : null}
      {history.length ? (
        <Card pad="md" className="mt-6">
          <h2 className="text-base font-semibold text-ink">Reminders so far</h2>
          <ul className="mt-2 divide-y divide-line text-sm">
            {history.map((h) => (
              <li key={h.id} className="py-2 text-ink-soft">
                {REMINDERS[h.kind]?.label || h.kind} for {formatDateShort(h.ends_on)} ·{" "}
                {h.skipped ? "Handled without email" : `Emailed to ${h.sent_to}`} · {formatDateShort(venueDayOf(h.sent_at))}
                {h.sent_by ? ` by ${h.sent_by}` : ""}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

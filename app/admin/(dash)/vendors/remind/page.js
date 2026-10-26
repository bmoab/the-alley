import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin, getActor } from "@/lib/auth.js";
import { getVendor, listVendors } from "@/lib/inventory.js";
import { reminderFor, reminderContext, noteReminder } from "@/lib/vendor-record.js";
import { makerReminderEmail, sendMakerReminder } from "@/lib/email.js";
import { logActivity } from "@/lib/activity.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import Card from "@/components/admin/ui/Card.js";
import Badge from "@/components/admin/ui/Badge.js";
import ConfirmButton from "@/components/admin/ui/ConfirmButton.js";

export const metadata = { title: "Remind makers" };
export const dynamic = "force-dynamic";

const PATH = "/admin/vendors/remind";

/** Who this page is about: one maker (?id=), or everyone with something to do. */
function recipients(id) {
  const list = id ? [getVendor(id)].filter(Boolean) : listVendors();
  return list.map((v) => ({ v, ctx: reminderFor(v) ? reminderContext(v) : null })).filter((r) => r.ctx);
}

const LABEL = { first: "Agree to the terms", updated: "Agree to the updated terms", share: "Agree to their new share" };

async function send(formData) {
  "use server";
  await requireAdmin();
  const actor = await getActor();
  const id = Number(formData.get("id")) || null;
  const ids = formData.getAll("vendor").map(Number);
  // Only the people shown on the page, and only if they still need it.
  const list = recipients(id).filter((r) => ids.includes(r.v.id));
  let sent = 0;
  let failed = 0;
  for (const { v, ctx } of list) {
    const result = await sendMakerReminder(ctx.vendor, ctx);
    if (!result?.ok) {
      failed++;
      continue;
    }
    sent++;
    noteReminder(v.id, ctx, actor.actorName);
    logActivity({ eventType: "maker_reminded", description: `Reminded ${v.name} (${v.email})`, recipientEmail: v.email, ...actor });
  }
  revalidatePath("/admin/vendors");
  const msg = failed ? `Sent ${sent}; ${failed} didn't go through — try those again.` : `Reminder sent to ${sent} ${sent === 1 ? "person" : "people"}.`;
  redirect(id ? `/admin/vendors/${id}?toast=${encodeURIComponent(msg)}&toastType=${failed ? "error" : "success"}#record` : `/admin/vendors?toast=${encodeURIComponent(msg)}&toastType=${failed ? "error" : "success"}`);
}

/**
 * Remind makers and artists to make their account and/or agree to the terms.
 * Shows exactly who gets what, and a preview of the email, before anything goes.
 */
export default async function RemindPage({ searchParams }) {
  await requireAdmin();
  const id = Number(searchParams?.id) || null;
  const list = recipients(id);
  const pick = list.find((r) => r.v.id === Number(searchParams?.show)) || list[0];
  const preview = pick ? makerReminderEmail(pick.ctx.vendor, pick.ctx) : null;
  const noEmail = id ? null : listVendors().filter((v) => !v.email).length;

  return (
    <div className="max-w-4xl">
      <PageHeader
        eyebrow="Makers"
        title={id && list[0] ? `Remind ${list[0].v.name}` : "Remind makers and artists"}
        subtitle="An email asking them to agree to the terms and/or make their account, with a button to their own page. It also goes in their account inbox. Nothing is sent until you press Send."
      />

      {!list.length ? (
        <Card>
          <p className="text-sm text-ink">Nobody needs a reminder: everyone with an email has an account and has agreed to the current terms.</p>
          <p className="mt-3 text-sm">
            <Link href={id ? `/admin/vendors/${id}` : "/admin/vendors"} className="font-semibold text-verde-deep hover:underline">
              Back
            </Link>
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <Card>
            <h2 className="font-semibold text-ink">
              {list.length} {list.length === 1 ? "person" : "people"}
            </h2>
            <ul className="mt-2 divide-y divide-line text-sm">
              {list.map(({ v, ctx }) => (
                <li key={v.id} className="py-2.5">
                  <Link
                    href={`${PATH}?${new URLSearchParams({ ...(id ? { id } : {}), show: v.id })}`}
                    className={`font-semibold hover:underline ${pick?.v.id === v.id ? "text-verde-deep" : "text-ink"}`}
                  >
                    {v.name}
                  </Link>
                  <span className="block text-xs text-ink-muted">{v.email}</span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {ctx.agree ? <Badge tone="warning">{LABEL[ctx.agree]}</Badge> : null}
                    {ctx.account ? <Badge tone="neutral">Make an account</Badge> : null}
                    {ctx.artist ? <Badge tone="sky">Artist</Badge> : null}
                  </span>
                </li>
              ))}
            </ul>
            {noEmail ? (
              <p className="mt-3 text-xs text-ink-muted">
                {noEmail} maker{noEmail === 1 ? " has" : "s have"} no email, so can&apos;t be reminded here. Add one on their page, or text
                them their private link.
              </p>
            ) : null}
            <form action={send} className="mt-4">
              {id ? <input type="hidden" name="id" value={id} /> : null}
              {list.map(({ v }) => (
                <input key={v.id} type="hidden" name="vendor" value={v.id} />
              ))}
              <ConfirmButton
                label={list.length === 1 ? "Send it" : `Send to all ${list.length}`}
                variant="accent"
                confirmLabel="Yes, send"
                pendingLabel="Sending…"
                question={`Emails ${list.length === 1 ? list[0].v.email : `${list.length} people`} now. Each one only mentions what that person still needs to do.`}
              />
            </form>
          </Card>

          {preview ? (
            <Card>
              <p className="text-xs text-ink-muted">
                Preview for <span className="font-semibold text-ink">{pick.v.name}</span> · To {preview.to}
              </p>
              <p className="mt-1 text-sm font-semibold text-ink">{preview.subject}</p>
              <iframe
                title="Email preview"
                srcDoc={preview.html}
                sandbox=""
                className="mt-3 h-[34rem] w-full rounded-xl border border-line bg-paper"
              />
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}

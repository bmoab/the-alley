import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin, getActor } from "@/lib/auth.js";
import { getExhibitor } from "@/lib/catalog.js";
import { logVendorEvent } from "@/lib/inventory.js";
import { artistLinkContext } from "@/lib/vendor-record.js";
import { artistLinkEmail, sendArtistLink } from "@/lib/email.js";
import { logActivity } from "@/lib/activity.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import Card from "@/components/admin/ui/Card.js";
import Badge from "@/components/admin/ui/Badge.js";
import ConfirmButton from "@/components/admin/ui/ConfirmButton.js";

export const metadata = { title: "Email their link" };
export const dynamic = "force-dynamic";

const LABEL = { first: "Agree to the terms", updated: "Agree to the updated terms", share: "Agree to their new share" };

async function send(formData) {
  "use server";
  await requireAdmin();
  const actor = await getActor();
  const id = Number(formData.get("id"));
  const ex = getExhibitor(id);
  const ctx = artistLinkContext(ex);
  if (!ctx) redirect(`/admin/exhibitors/${id}?toast=${encodeURIComponent("Add their email first (Artist → Edit).")}&toastType=error`);
  let ok = true;
  try {
    const res = await sendArtistLink(ex, ctx);
    if (res?.ok === false) ok = false;
  } catch (err) {
    console.error("[exhibitors] link email error:", err.message);
    ok = false;
  }
  if (ok) {
    const what = [ctx.agree ? "agree to the terms" : null, ctx.account ? "make an account" : null].filter(Boolean).join(" and ");
    if (ctx.maker) logVendorEvent(ctx.maker.id, "reminder", `The Alley emailed their private link${what ? `, asking them to ${what}` : ""}`, actor.actorName);
    logActivity({ eventType: "maker_reminded", description: `Emailed ${ex.name} their private link (${ex.contact_email})`, recipientEmail: ex.contact_email, ...actor });
    revalidatePath(`/admin/exhibitors/${id}`);
  }
  redirect(
    `/admin/exhibitors/${id}?toast=${encodeURIComponent(
      ok ? `Emailed ${ex.contact_email} their link.` : "The email didn't send. Try again in a minute, or copy the link and text it."
    )}&toastType=${ok ? "success" : "error"}`
  );
}

/** Preview an artist's link email, then send it. Nothing goes until Send. */
export default async function ArtistEmailPage({ params }) {
  await requireAdmin();
  const id = Number(params.id);
  const ex = getExhibitor(id);
  if (!ex) notFound();
  const ctx = artistLinkContext(ex);
  const preview = ctx ? artistLinkEmail(ex, ctx) : null;

  return (
    <div className="max-w-4xl">
      <PageHeader
        eyebrow="Exhibitors"
        title={`Email ${ex.name} their link`}
        subtitle="Their one private link: their gallery page and, if we sell their art, the Sales & payouts tab with the terms to agree to. A copy goes in their account's Activity. Nothing is sent until you press Send."
      />
      {!ctx ? (
        <Card>
          <p className="text-sm text-ink">They need an email on file first. Add one under Artist → Edit, or copy their link and text it.</p>
          <p className="mt-3 text-sm">
            <Link href={`/admin/exhibitors/${id}`} className="font-semibold text-verde-deep hover:underline">
              Back
            </Link>
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <Card>
            <h2 className="font-semibold text-ink">{ex.name}</h2>
            <span className="block text-xs text-ink-muted">{ex.contact_email}</span>
            <span className="mt-2 flex flex-wrap gap-1">
              <Badge tone="sage">Their private link</Badge>
              {ctx.sells ? <Badge tone="sky">Art sales</Badge> : null}
              {ctx.agree ? <Badge tone="warning">{LABEL[ctx.agree]}</Badge> : null}
              {ctx.account ? <Badge tone="neutral">Make an account</Badge> : null}
            </span>
            <form action={send} className="mt-4">
              <input type="hidden" name="id" value={id} />
              <ConfirmButton
                label="Send it"
                variant="accent"
                confirmLabel="Yes, send"
                pendingLabel="Sending…"
                question={`Emails ${ex.contact_email} their private link now.`}
              />
            </form>
            <p className="mt-3 text-sm">
              <Link href={`/admin/exhibitors/${id}`} className="font-semibold text-verde-deep hover:underline">
                Back
              </Link>
            </p>
          </Card>
          <Card>
            <p className="text-xs text-ink-muted">To {preview.to}</p>
            <p className="mt-1 text-sm font-semibold text-ink">{preview.subject}</p>
            <iframe title="Email preview" srcDoc={preview.html} sandbox="" className="mt-3 h-[34rem] w-full rounded-xl border border-line bg-paper" />
          </Card>
        </div>
      )}
    </div>
  );
}

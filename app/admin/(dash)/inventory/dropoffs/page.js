import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, getActor } from "@/lib/auth.js";
import { listDropoffs, getDropoff, declineDropoff } from "@/lib/inventory.js";
import { logActivity } from "@/lib/activity.js";
import { formatDateShort, formatMoney } from "@/lib/constants.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import Card from "@/components/admin/ui/Card.js";
import Badge from "@/components/admin/ui/Badge.js";
import Button from "@/components/admin/ui/Button.js";

export const metadata = { title: "Drop-offs" };
export const dynamic = "force-dynamic";

async function decline(formData) {
  "use server";
  await requireAdmin();
  const actor = await getActor();
  const id = Number(formData.get("id"));
  try {
    declineDropoff(id, formData.get("reason"), actor.actorName);
  } catch (err) {
    redirect(`/admin/inventory/dropoffs?toast=${encodeURIComponent(err.message)}&toastType=error`);
  }
  logActivity({ eventType: "dropoff_declined", description: `Drop-off #${id} not accepted`, ...actor });
  revalidatePath("/admin/inventory/dropoffs");
  redirect(`/admin/inventory/dropoffs?toast=${encodeURIComponent("Marked as not accepted — they'll see why in their account.")}&toastType=neutral`);
}

const STATUS = {
  accepted: { tone: "success", label: "received" },
  declined: { tone: "danger", label: "not accepted" },
  cancelled: { tone: "neutral", label: "cancelled by maker" },
};

/** What makers have said they're bringing in. Counting one in opens Receive stock, filled in. */
export default async function DropoffsPage() {
  await requireAdmin();
  const waiting = listDropoffs({ status: "submitted" }).map((d) => ({ ...d, lines: getDropoff(d.id).lines }));
  const done = listDropoffs({ limit: 30 }).filter((d) => d.status !== "submitted");

  return (
    <div>
      <PageHeader
        title="Drop-offs"
        subtitle="Makers list what they're bringing from their account. When they come in, count it together and receive it — it goes into Square and you print the tags."
      />
      <div className="mb-5 flex flex-wrap gap-2">
        <Button href="/admin/inventory/receive" variant="ghost">+ Receive without a list</Button>
      </div>

      {waiting.length ? (
        <div className="space-y-3">
          {waiting.map((d) => (
            <Card key={d.id} pad="md">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <Link href={`/admin/vendors/${d.vendor_id}`} className="text-base font-semibold text-ink hover:underline">
                  {d.vendor_name}
                </Link>
                <span className="text-sm text-ink-muted">
                  listed {formatDateShort(d.created_at.slice(0, 10))} · {d.units} item{d.units === 1 ? "" : "s"} · {formatMoney(d.value)}
                </span>
              </div>
              <ul className="mt-2 text-sm text-ink-soft">
                {d.lines.map((l) => (
                  <li key={l.id}>
                    {l.qty} × {l.name} <span className="text-ink-muted">@ {formatMoney(l.price)}</span>
                    {l.item_id ? <span className="text-xs text-ink-muted"> (more of an existing item)</span> : null}
                  </li>
                ))}
              </ul>
              {d.notes ? <p className="mt-2 text-sm italic text-ink-muted">&ldquo;{d.notes}&rdquo;</p> : null}
              <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3">
                <Button href={`/admin/inventory/receive?dropoff=${d.id}`} variant="accent">Count it in</Button>
                <form action={decline} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={d.id} />
                  <input name="reason" required placeholder="Why not (they'll see this)" className="field !h-10 max-w-xs" />
                  <Button type="submit" variant="danger">Don&apos;t accept</Button>
                </form>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card pad="md">
          <p className="text-sm text-ink-soft">No drop-offs waiting. Makers list them from their account or private link (on each maker&apos;s page).</p>
        </Card>
      )}

      {done.length ? (
        <Card pad="md" className="mt-8">
          <h2 className="text-base font-semibold text-ink">Recent</h2>
          <ul className="mt-2 divide-y divide-line text-sm">
            {done.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="font-semibold text-ink">{d.vendor_name}</span>
                <span className="text-ink-muted">
                  {formatDateShort(d.created_at.slice(0, 10))} · {d.units} item{d.units === 1 ? "" : "s"}
                </span>
                <Badge tone={STATUS[d.status]?.tone || "neutral"}>{STATUS[d.status]?.label || d.status}</Badge>
                {d.intake_id ? (
                  <Link href={`/admin/inventory/intake/${d.intake_id}`} className="text-xs font-semibold underline">
                    sheet #{d.intake_id}
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

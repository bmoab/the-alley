import Link from "next/link";
import { Palette, Plus } from "lucide-react";
import { listExhibitors } from "@/lib/catalog.js";
import { makerForExhibitor } from "@/lib/agreement-reminders.js";
import { formatDateShort } from "@/lib/constants.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import Badge from "@/components/admin/ui/Badge.js";
import Dialog from "@/components/admin/ui/Dialog.js";
import AddExhibitorForm from "@/components/admin/exhibitors/AddExhibitorForm.js";
import { requireAdmin } from "@/lib/auth.js";
import { addExhibitor } from "./actions.js";
import { exhibitorStatus, exhibitorPhoto, agreementState, initials } from "./shared.js";

export const metadata = { title: "Exhibitors" };

const SECTIONS = [
  { key: "current", title: "On view" },
  { key: "hidden", title: "Hidden" },
  { key: "past", title: "Past" },
];

/**
 * The gallery's artists as cards (tap one for their page): who's on view
 * first, then anyone switched off, then the Past archive.
 */
export default async function ExhibitorsAdminPage() {
  await requireAdmin();
  const exhibitors = listExhibitors().map((ex) => ({
    ...ex,
    status: exhibitorStatus(ex),
    agreement: agreementState(ex),
    maker: makerForExhibitor(ex),
  }));
  const onView = exhibitors.filter((ex) => ex.status.key === "current").length;
  const due = exhibitors.filter((ex) => ex.agreement.due).length;

  return (
    <div>
      <PageHeader
        title="Exhibitors"
        subtitle="The artists in the gallery. Add their name and email, send their private link, and they fill in the rest. They move to Past once their agreement ends."
        actions={
          <Dialog
            title="Add an exhibitor"
            trigger={
              <>
                <Plus className="h-4 w-4" aria-hidden="true" /> Add exhibitor
              </>
            }
            triggerClassName="inline-flex h-10 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-paper transition hover:bg-ink-soft"
          >
            <AddExhibitorForm action={addExhibitor} />
          </Dialog>
        }
      />

      {exhibitors.length ? (
        <div className="mb-6 flex flex-wrap gap-2 text-sm">
          <span className="rounded-full border border-line bg-paper px-3 py-1 text-ink-soft">
            <b className="text-ink">{onView}</b> on view
          </span>
          <span className="rounded-full border border-line bg-paper px-3 py-1 text-ink-soft">
            <b className="text-ink">{exhibitors.length}</b> in all
          </span>
          {due ? (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-800">
              <b>{due}</b> {due === 1 ? "reminder" : "reminders"} to send
            </span>
          ) : null}
        </div>
      ) : null}

      {exhibitors.length ? (
        SECTIONS.map((s) => {
          const list = exhibitors.filter((ex) => ex.status.key === s.key);
          if (!list.length) return null;
          return (
            <section key={s.key} className="mb-10">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">{s.title}</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {list.map((ex) => (
                  <ExhibitorCard key={ex.id} ex={ex} />
                ))}
              </div>
            </section>
          );
        })
      ) : (
        <div className="card flex flex-col items-center gap-2 p-10 text-center">
          <Palette className="h-8 w-8 text-verde-deep" aria-hidden="true" />
          <p className="font-semibold text-ink">No exhibitors yet</p>
          <p className="text-sm text-ink-muted">Add the first one with “Add exhibitor” above.</p>
        </div>
      )}
    </div>
  );
}

function ExhibitorCard({ ex }) {
  const photo = exhibitorPhoto(ex);
  const { endsOn, due } = ex.agreement;
  return (
    <Link
      href={`/admin/exhibitors/${ex.id}`}
      className={`group card overflow-hidden p-0 transition duration-200 hover:-translate-y-0.5 hover:border-verde-deep/40 hover:shadow-card-hover ${
        ex.status.key === "past" ? "opacity-75 hover:opacity-100" : ""
      }`}
    >
      <div className="relative aspect-[3/2] overflow-hidden bg-verde/50">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-3xl font-semibold tracking-wide text-verde-deep">
            {initials(ex.name)}
          </span>
        )}
        {ex.status.key !== "current" ? (
          <span className="absolute left-3 top-3">
            <Badge tone={ex.status.tone}>{ex.status.label}</Badge>
          </span>
        ) : null}
      </div>
      <div className="p-4">
        <p className="truncate text-base font-semibold text-ink">{ex.name}</p>
        <p className="mt-0.5 truncate text-xs text-ink-muted">{ex.discipline || "No discipline yet"}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {endsOn ? (
            <span className="rounded-full bg-paper-warm px-2.5 py-0.5 text-xs font-semibold text-ink-soft">
              {ex.status.key === "past" ? "Ended" : "Ends"} {formatDateShort(endsOn)}
            </span>
          ) : (
            <span className="rounded-full bg-paper-warm px-2.5 py-0.5 text-xs text-ink-muted">No end date</span>
          )}
          {due ? (
            <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">Reminder due</span>
          ) : null}
          {ex.maker ? (
            <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-800">Sells in the shop</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

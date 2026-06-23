import Link from "next/link";
import { listAllActivity } from "@/lib/activity.js";
import {
  TYPE_LABELS,
  typeLabel,
  dotColor,
  denverShort,
  DELIVERY_COLOR,
} from "@/lib/activity-meta.js";
import { spaceName, formatMoney } from "@/lib/constants.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import Card from "@/components/admin/ui/Card.js";
import Button from "@/components/admin/ui/Button.js";
import { DataTable, Tr, Td } from "@/components/admin/ui/DataTable.js";

export const metadata = { title: "Activity" };

export default function ActivityFeedPage({ searchParams }) {
  const type = searchParams?.type || "all";
  const q = searchParams?.q || "";
  const rows = listAllActivity({ type, q, limit: 300 });

  // Preserve filters when a row opens its booking drawer (?b=…).
  const drawerHref = (bookingId) => {
    const p = new URLSearchParams();
    if (type && type !== "all") p.set("type", type);
    if (q) p.set("q", q);
    p.set("b", String(bookingId));
    return `/admin/activity?${p.toString()}`;
  };

  return (
    <div>
      <PageHeader
        title="Activity"
        subtitle="Every meaningful action across all bookings, newest first. Click a row to open that booking's full timeline."
      />

      {/* Filters (GET) */}
      <form className="mb-5 flex flex-wrap items-end gap-3" method="get">
        <div>
          <label className="label" htmlFor="type">Event type</label>
          <select id="type" name="type" defaultValue={type} className="field min-w-[14rem]">
            <option value="all">All events</option>
            {Object.keys(TYPE_LABELS).map((t) => (
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[12rem]">
          <label className="label" htmlFor="q">Search client</label>
          <input id="q" name="q" defaultValue={q} className="field" placeholder="Name or email" />
        </div>
        <Button type="submit" variant="ghost">Filter</Button>
        {type !== "all" || q ? (
          <Button href="/admin/activity" variant="subtle">Clear</Button>
        ) : null}
      </form>

      {rows.length === 0 ? (
        <Card pad="lg" className="py-12 text-center text-ink-muted">
          No activity matches this filter yet.
        </Card>
      ) : (
        <Card pad="sm">
          <DataTable columns={["When", "Event", "Booking", "By"]} minWidth={760}>
            {rows.map((r) => {
              const tag = r.delivery_status ? DELIVERY_COLOR[r.delivery_status] || DELIVERY_COLOR.unknown : null;
              const clientName = r.booking_client_name;
              return (
                <Tr key={r.id}>
                  <Td className="whitespace-nowrap text-xs text-ink-muted">
                    {denverShort(r.created_at)}
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: dotColor(r.event_type) }}
                        aria-hidden="true"
                      />
                      <span className="font-medium text-ink">{r.description}</span>
                      {tag ? (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                          style={{ background: tag.bg, color: tag.fg }}
                        >
                          {r.delivery_status}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 text-xs text-ink-muted">
                      {typeLabel(r.event_type)}
                      {r.recipient_email ? ` · ${r.recipient_email}` : ""}
                      {r.amount != null && !/\$/.test(r.description) ? ` · ${formatMoney(r.amount)}` : ""}
                    </div>
                  </Td>
                  <Td>
                    {r.booking_id ? (
                      <Link href={drawerHref(r.booking_id)} className="text-verde-deep hover:underline">
                        {clientName || `Booking #${r.booking_id}`}
                        {r.booking_space ? (
                          <span className="block text-xs text-ink-muted">{spaceName(r.booking_space)}</span>
                        ) : null}
                      </Link>
                    ) : (
                      <span className="text-xs text-ink-muted">—</span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-sm text-ink-soft">
                    {!r.actor_name || r.actor_name === "system" ? "system" : r.actor_name}
                  </Td>
                </Tr>
              );
            })}
          </DataTable>
        </Card>
      )}
    </div>
  );
}

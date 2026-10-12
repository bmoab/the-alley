import Link from "next/link";
import { requireAccount, listInbox } from "@/lib/accounts.js";
import { formatDate } from "@/lib/constants.js";

export const metadata = { title: "Inbox" };

/** A copy of everything we've emailed this address — invoices, receipts, payouts, notices. */
export default async function InboxPage() {
  const account = await requireAccount("/account/inbox");
  const messages = listInbox(account.email);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Inbox</h1>
        <p className="mt-1 text-sm text-ink-muted">
          A copy of everything we&apos;ve sent to {account.email} — invoices, payment receipts, payouts and updates. Nothing to
          dig for in your email.
        </p>
      </div>
      {messages.length ? (
        <ul className="divide-y divide-line rounded-xl border border-line bg-paper">
          {messages.map((m) => (
            <li key={m.id}>
              <Link href={`/account/inbox/${m.id}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-3 hover:bg-paper-dim">
                <span className="min-w-0 flex-1 truncate font-semibold text-ink">{m.subject}</span>
                <span className="text-xs text-ink-muted">
                  {formatDate(m.sent_at.slice(0, 10))}
                  {m.mode === "inbox" ? " · posted here" : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-muted">Nothing yet. From now on, every email we send you is kept here too.</p>
      )}
    </div>
  );
}

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireAccount, listInbox } from "@/lib/accounts.js";
import { formatDate } from "@/lib/constants.js";

export const metadata = { title: "Inbox" };

/** A copy of everything we've emailed this address — invoices, receipts, payouts, notices. */
export default async function InboxPage() {
  const account = await requireAccount("/account/inbox");
  const messages = listInbox(account.email);
  return (
    <>
      <header className="ac-hello">
        <p className="ac-eyebrow ac-date ac-rise">Inbox</p>
        <h1 className="ac-title ac-rise ac-rise-1">Everything we&apos;ve sent you</h1>
        <p className="ac-lede ac-rise ac-rise-2">
          Invoices, receipts, payouts and updates to {account.email} — kept here, so there&apos;s nothing to dig for.
        </p>
      </header>
      {messages.length ? (
        <ul className="ac-mail ac-rows ac-rise ac-rise-3">
          {messages.map((m) => (
            <li key={m.id}>
              <Link href={`/account/inbox/${m.id}`}>
                <span className="ac-mail-mark" aria-hidden="true">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/brand/emblem-black.png" alt="" />
                </span>
                <span className="ac-row-main">
                  <span className="ac-row-title">{m.subject}</span>
                  <span className="ac-row-sub">{m.mode === "inbox" ? "Posted to your account" : "The Alley On Center"}</span>
                </span>
                <span className="ac-mail-date">{formatDate(m.sent_at.slice(0, 10))}</span>
                <ChevronRight className="ac-row-chev" width={18} height={18} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="ac-set-card ac-rise ac-rise-3">
          <p className="ac-tile-body">Nothing yet. From now on, every email we send you is kept here too.</p>
        </div>
      )}
    </>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccount, getInboxMessage } from "@/lib/accounts.js";
import { formatDate } from "@/lib/constants.js";

export const metadata = { title: "Inbox" };

// Inside the frame: nothing loads but https images and inline styles, and no
// <meta> from the stored email survives (a meta refresh would navigate the
// frame even with scripts off).
const FRAME_CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'">`;
const stripMeta = (html) => String(html || "").replace(/<meta\b[^>]*>/gi, "");

/**
 * One message, shown exactly as it was emailed. It renders in a sandboxed
 * frame: the email's own styles stay inside it, and nothing in it can run.
 */
export default async function MessagePage({ params }) {
  const account = await requireAccount(`/account/inbox/${params.id}`);
  const m = getInboxMessage(account.email, params.id);
  if (!m) notFound();
  const attachments = m.attachments ? JSON.parse(m.attachments) : [];
  return (
    <div className="space-y-4">
      <Link href="/account/inbox" className="text-sm font-semibold text-ink-muted hover:text-ink">
        ← Inbox
      </Link>
      <div>
        <h1 className="text-xl font-semibold text-ink">{m.subject}</h1>
        <p className="text-xs text-ink-muted">
          {m.mode === "inbox" ? "Posted" : "Sent"} {formatDate(m.sent_at.slice(0, 10))} to {m.to_email}
          {attachments.length ? ` · came with ${attachments.join(", ")}` : ""}
        </p>
      </div>
      <iframe
        title={m.subject}
        srcDoc={`${FRAME_CSP}<base target="_blank">${stripMeta(m.html)}`}
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        className="h-[70vh] w-full rounded-xl border border-line bg-paper"
      />
    </div>
  );
}

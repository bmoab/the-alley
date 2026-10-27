import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccount, getInboxMessage } from "@/lib/accounts.js";
import { venueDayOf, formatDate } from "@/lib/constants.js";

export const metadata = { title: "Activity" };

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
  const account = await requireAccount(`/account/activity/email/${params.id}`);
  const m = getInboxMessage(account.email, params.id);
  if (!m) notFound();
  const attachments = m.attachments ? JSON.parse(m.attachments) : [];
  return (
    <>
      <Link href="/account/activity?type=email" className="ac-rulelink ac-rise">Activity</Link>
      <h1 className="ac-title ac-rise ac-rise-1" style={{ fontSize: "clamp(26px,3.4vw,38px)", marginTop: 22 }}>{m.subject}</h1>
      <article className="ac-letter ac-rise ac-rise-2" style={{ marginTop: 26 }}>
        <div className="ac-letter-head">
          <span className="ac-mail-mark" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/emblem-black.png" alt="" />
          </span>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 600 }}>The Alley On Center</p>
            <p className="ac-small" style={{ margin: 0 }}>
              {m.mode === "inbox" ? "Posted" : "Sent"} {formatDate(venueDayOf(m.sent_at))} to {m.to_email}
              {attachments.length ? ` · came with ${attachments.join(", ")}` : ""}
            </p>
          </div>
        </div>
        <iframe
          title={m.subject}
          srcDoc={`${FRAME_CSP}<base target="_blank">${stripMeta(m.html)}`}
          sandbox="allow-popups allow-popups-to-escape-sandbox"
        />
      </article>
    </>
  );
}

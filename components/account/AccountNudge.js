import Link from "next/link";
import { getAccount } from "@/lib/accounts.js";
import { normalizeEmail } from "@/lib/portal.js";

/**
 * A line on each private-link page (bookings, host listing, business listing,
 * exhibitor page) saying the same things live in an account. The links keep
 * working either way — an account just gathers them, plus a copy of every
 * email we send, behind one sign-in.
 */
export default async function AccountNudge({ email }) {
  const clean = normalizeEmail(email);
  if (!clean) return null;
  const account = await getAccount();
  if (account && normalizeEmail(account.email) === clean) {
    return (
      <p className="ac-note" style={{ marginTop: 20 }}>
        <span>
          You&apos;re signed in.{" "}
          <Link href="/account" style={{ fontWeight: 600, textDecoration: "underline" }}>
            Your account
          </Link>{" "}
          has this and everything else you have with us.
        </span>
      </p>
    );
  }
  return (
    <p className="ac-note" style={{ marginTop: 20 }}>
      <span>
        Keep it all in one place:{" "}
        <Link href="/account/sign-up" style={{ fontWeight: 600, textDecoration: "underline" }}>
          create an account
        </Link>{" "}
        with {clean} (or{" "}
        <Link href="/account/sign-in" style={{ fontWeight: 600, textDecoration: "underline" }}>
          sign in
        </Link>
        ) to see this, your other bookings and listings, and a copy of every email we send you. This link keeps working
        either way.
      </span>
    </p>
  );
}

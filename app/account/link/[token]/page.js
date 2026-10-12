import Link from "next/link";
import { peekToken, safeNext } from "@/lib/accounts.js";
import { continueWithLink } from "../../actions.js";
import Button from "@/components/admin/ui/Button.js";

export const metadata = { title: "Sign in" };

/**
 * An emailed sign-in link. Opening it does nothing by itself — email scanners
 * open links to check them, and would burn a single-use token — so the person
 * taps Continue.
 */
export default function LinkPage({ params, searchParams }) {
  const row = peekToken(params.token, "signin");
  if (!row) {
    return (
      <div className="card mx-auto max-w-md p-6 text-center">
        <h1 className="text-xl font-semibold text-ink">That link has expired</h1>
        <p className="mt-2 text-sm text-ink-muted">Sign-in links work once, for 30 minutes.</p>
        <Button href="/account/sign-in" className="mt-4">Get a new one</Button>
      </div>
    );
  }
  return (
    <form action={continueWithLink} className="card mx-auto max-w-md space-y-3 p-6 text-center">
      <input type="hidden" name="token" value={params.token} />
      <input type="hidden" name="next" value={safeNext(searchParams?.next)} />
      <h1 className="text-xl font-semibold text-ink">Sign in as {row.email}</h1>
      <Button type="submit" full>Continue</Button>
      <p className="text-xs text-ink-muted">
        Not you? <Link href="/account/sign-in" className="underline">Go back</Link>
      </p>
    </form>
  );
}

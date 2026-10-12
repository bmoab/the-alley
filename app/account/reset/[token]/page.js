import { peekToken } from "@/lib/accounts.js";
import { finishReset } from "../../actions.js";
import Button from "@/components/admin/ui/Button.js";

export const metadata = { title: "Choose a new password" };

const ERRORS = {
  match: "Those two passwords don't match.",
  short: "Pick a password at least 10 characters long.",
};

export default function NewPasswordPage({ params, searchParams }) {
  const row = peekToken(params.token, "reset");
  if (!row) {
    return (
      <div className="card mx-auto max-w-md p-6 text-center">
        <h1 className="text-xl font-semibold text-ink">That link has expired</h1>
        <Button href="/account/reset" className="mt-4">Send a new one</Button>
      </div>
    );
  }
  return (
    <form action={finishReset} className="card mx-auto max-w-md space-y-3 p-6">
      <input type="hidden" name="token" value={params.token} />
      <h1 className="text-xl font-semibold text-ink">New password for {row.email}</h1>
      {ERRORS[searchParams?.error] ? (
        <p className="rounded-lg border border-rust/30 bg-rust/10 px-3 py-2 text-sm text-rust">{ERRORS[searchParams.error]}</p>
      ) : null}
      <div>
        <label className="label" htmlFor="password">New password (10+ characters)</label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required className="field" />
      </div>
      <div>
        <label className="label" htmlFor="confirm">Same again</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required className="field" />
      </div>
      <Button type="submit" full>Save and sign in</Button>
    </form>
  );
}

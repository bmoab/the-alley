import { requireAccount } from "@/lib/accounts.js";
import { saveSettings, signOut } from "../actions.js";
import Card from "@/components/admin/ui/Card.js";
import Button from "@/components/admin/ui/Button.js";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }) {
  const account = await requireAccount("/account/settings");
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold text-ink">Settings</h1>
      {searchParams?.welcome && !account.password_hash ? (
        <p className="rounded-lg border border-verde-deep/40 bg-verde/30 px-3 py-2 text-sm text-ink">
          You&apos;re in. Want a password for next time? Add one below — or skip it and{" "}
          <a href="/account" className="font-semibold underline">go to your account</a>; we&apos;ll email you a link whenever
          you sign in.
        </p>
      ) : null}
      <Card pad="md">
        <form action={saveSettings} className="space-y-3">
          <div>
            <label className="label" htmlFor="name">Your name</label>
            <input id="name" name="name" defaultValue={account.name || ""} className="field" />
          </div>
          <div>
            <p className="label">Email</p>
            <p className="text-sm text-ink">{account.email}</p>
            <p className="text-xs text-ink-muted">Everything in your account is matched by this address. To change it, ask us.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="password">{account.password_hash ? "New password" : "Add a password"} (10+ characters)</label>
              <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} className="field" />
            </div>
            <div>
              <label className="label" htmlFor="confirm">Same again</label>
              <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} className="field" />
            </div>
          </div>
          <p className="text-xs text-ink-muted">Leave the password blank to keep {account.password_hash ? "yours" : "signing in by email link"}.</p>
          <Button type="submit">Save</Button>
        </form>
      </Card>
      <form action={signOut}>
        <Button type="submit" variant="ghost">Sign out</Button>
      </form>
    </div>
  );
}

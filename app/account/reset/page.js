import { requestReset } from "../actions.js";
import Button from "@/components/admin/ui/Button.js";

export const metadata = { title: "Reset your password" };

export default function ResetPage({ searchParams }) {
  return (
    <div className="mx-auto max-w-md space-y-5">
      <h1 className="text-2xl font-semibold text-ink">Reset your password</h1>
      {searchParams?.sent ? (
        <p className="rounded-lg border border-verde-deep/40 bg-verde/30 px-3 py-2 text-sm text-ink">
          If {searchParams.email || "that address"} has an account, a reset link is on its way.
        </p>
      ) : null}
      <form action={requestReset} className="card space-y-3 p-6">
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required defaultValue={searchParams?.email || ""} className="field" />
        <Button type="submit" full>Email me a reset link</Button>
      </form>
    </div>
  );
}

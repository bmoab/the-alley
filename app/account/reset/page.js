import { requestReset } from "../actions.js";
import Link from "next/link";
import CooldownButton from "@/components/auth/CooldownButton.js";

export const metadata = { title: "Reset your password" };

export default function ResetPage({ searchParams }) {
  return (
    <div className="mx-auto max-w-md space-y-5">
      <h1 className="text-2xl font-semibold text-ink">Reset your password</h1>
      {searchParams?.sent ? (
        <p className="rounded-lg border border-verde-deep/40 bg-verde/30 px-3 py-2 text-sm text-ink">
          If {searchParams.email || "that address"} has an account or a staff login, a reset link is on its way. Give it a
          few minutes and check spam — only the newest link works.
        </p>
      ) : null}
      <form action={requestReset} className="card space-y-3 p-6">
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required defaultValue={searchParams?.email || ""} className="field" />
        <CooldownButton storageKey="alley-account-reset" full>
          {searchParams?.sent ? "Send another link" : "Email me a reset link"}
        </CooldownButton>
      </form>
      {searchParams?.sent ? (
        <p className="text-center text-sm text-ink-muted">
          Nothing coming? You may not have an account yet —{" "}
          <Link href="/account/sign-up" className="font-semibold text-ink underline">
            make one
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}

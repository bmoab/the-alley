import { redirect } from "next/navigation";
import { getSignedInUser } from "@/lib/auth.js";

export const metadata = { title: "At the register" };

/**
 * A staff login's whole area. Shifts, clocking in, hours and pay all live in
 * Square (the register and the Square Team app); what's left here are the few
 * register habits the books depend on — makers are paid from what Square
 * records, so these keep their payouts right.
 */
export default async function StaffHome() {
  const user = await getSignedInUser();
  if (!user) redirect("/admin/login");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Hi, {(user.name || "there").split(" ")[0]}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Your schedule, clocking in and out, hours and pay stubs are all in the <strong className="text-ink">Square Team</strong>{" "}
          app and on the Square register.
        </p>
      </div>

      <section className="rounded-xl border border-line bg-paper p-4 text-sm">
        <h2 className="font-semibold text-ink">At the register</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-ink-soft">
          <li>
            <strong className="text-ink">Scan the tag</strong> — the camera button at the right of Square&apos;s search bar.
            No tag? Type the number under the code into search.
          </li>
          <li>
            <strong className="text-ink">Refunds: always item by item.</strong> In Square choose Issue refund, then pick the
            item(s) — never &ldquo;Refund by amount&rdquo;. That&apos;s how the maker&apos;s share comes back off automatically.
          </li>
          <li>
            <strong className="text-ink">Don&apos;t give a maker&apos;s item away</strong> (comp it) — ask Chelsea first. It&apos;s
            the maker&apos;s money.
          </li>
          <li>
            <strong className="text-ink">Never ring up a custom amount</strong> for a tagged item — scan or search it, so the
            sale counts for its maker.
          </li>
        </ul>
      </section>
    </div>
  );
}

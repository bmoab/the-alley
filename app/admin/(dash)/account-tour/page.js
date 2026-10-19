import Link from "next/link";
import { Monitor, Smartphone } from "lucide-react";
import { requireAdmin } from "@/lib/auth.js";
import { TOUR, tourMode } from "@/lib/account-tour.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import DevicePreview from "@/components/admin/tour/DevicePreview.js";
import { cx } from "@/components/admin/ui/cx.js";

export const metadata = { title: "Account tour" };

/**
 * What customers see when they sign in at alleyoncenter.com/account, one kind
 * of customer at a time, with sample people and numbers — so the team can
 * explain it and answer questions. Nothing here is real or saved.
 */
export default async function AccountTourPage({ searchParams }) {
  await requireAdmin();
  const m = tourMode(searchParams?.as);
  const view = searchParams?.view === "phone" ? "phone" : "desktop";
  const href = (q) => {
    const p = new URLSearchParams({ as: m.key, view, ...q });
    if (p.get("view") === "desktop") p.delete("view");
    return `/admin/account-tour?${p}`;
  };

  return (
    <div>
      <PageHeader
        title="Account tour"
        subtitle="What customers see when they sign in at alleyoncenter.com/account. Pick a kind of customer. The people and numbers are made up, and nothing you tap is saved or sent."
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {TOUR.map((t) => (
            <Link
              key={t.key}
              href={href({ as: t.key })}
              scroll={false}
              aria-current={t.key === m.key ? "page" : undefined}
              className={cx(
                "rounded-full border px-3.5 py-1.5 text-sm font-semibold transition",
                t.key === m.key ? "border-verde-deep/50 bg-verde/70 text-ink" : "border-line bg-paper text-ink-soft hover:border-ink/30 hover:text-ink"
              )}
            >
              {t.label}
            </Link>
          ))}
        </div>
        <div className="ml-auto flex rounded-xl bg-ink/[0.06] p-1">
          {[
            ["desktop", "Computer", Monitor],
            ["phone", "Phone", Smartphone],
          ].map(([key, label, Icon]) => (
            <Link
              key={key}
              href={href({ view: key })}
              scroll={false}
              aria-current={view === key ? "page" : undefined}
              className={cx(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                view === key ? "bg-paper text-ink shadow-sm" : "text-ink-muted hover:text-ink"
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {label}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <DevicePreview src={`/admin/tour-frame?as=${m.key}`} view={view} title={`Account page: ${m.label}`} />
          <p className="mt-2 text-xs text-ink-muted">Tap anything in the preview to see what it opens in a real account.</p>
        </div>

        <aside className="space-y-4">
          <section className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{m.label}</p>
            <p className="mt-1 text-sm text-ink-soft">{m.blurb}</p>
            <h2 className="mt-4 text-sm font-semibold text-ink">What they see</h2>
            <ul className="mt-2 space-y-2">
              {m.sees.map((s) => (
                <li key={s} className="flex gap-2.5 text-sm text-ink-soft">
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-verde-deep" aria-hidden="true" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card p-5">
            <h2 className="text-sm font-semibold text-ink">If they ask…</h2>
            <div className="mt-2 divide-y divide-line">
              {m.questions.map((q) => (
                <details key={q.q} className="group py-2.5">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-3 text-sm font-semibold text-ink">
                    “{q.q}”
                    <span className="mt-0.5 text-ink-muted transition group-open:rotate-45" aria-hidden="true">+</span>
                  </summary>
                  <p className="mt-1.5 text-sm text-ink-soft">{q.a}</p>
                </details>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-line p-5 text-sm text-ink-soft">
            <h2 className="text-sm font-semibold text-ink">How people get an account</h2>
            <p className="mt-1.5">
              They sign up at alleyoncenter.com/account with the email they use with us. Everything under that email shows up on
              its own. The private links we email still work without an account.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

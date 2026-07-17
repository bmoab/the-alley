"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal, useFormStatus } from "react-dom";
import Link from "next/link";
import Button from "@/components/admin/ui/Button.js";
import { cx } from "@/components/admin/ui/cx.js";

/**
 * Row actions for a booking, collapsed into a "⋯" menu.
 *
 * Every action used to be a stacked button in the table cell, which made rows
 * tall on desktop and pushed the whole column off-screen on a phone (the table
 * scrolls horizontally). One button keeps the cell narrow at any width.
 *
 * The menu and its dialogs are portaled to <body>: the table scrolls inside an
 * overflow-x-auto wrapper, which would otherwise clip an absolutely-positioned
 * dropdown.
 *
 * Anything that changes money or state (mark as paid, archive, restore) asks
 * for confirmation first. Read-only actions (check for payment) and navigations
 * (cancel, which opens its own page showing the refund quote) go straight
 * through.
 */

/**
 * Submit button for a confirm dialog. Reports back when the submission settles
 * so the dialog can close itself — the server action redirects, and this
 * component survives that re-render, so without this the dialog would sit there
 * covering the page after the action had already run.
 */
function ConfirmSubmit({ label, pendingLabel, tone, onSettled }) {
  const { pending } = useFormStatus();
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending) onSettled();
    wasPending.current = pending;
  }, [pending, onSettled]);
  return (
    <Button type="submit" variant={tone === "danger" ? "danger" : "accent"} disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

/** Hidden inputs echoing the list's filters so an action returns you where you were. */
function FilterFields({ filters }) {
  return (
    <>
      {Object.entries(filters || {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v ?? ""} />
      ))}
    </>
  );
}

export default function BookingActionsMenu({
  booking,
  filters,
  markPaidAction,
  checkPaymentAction,
  resendAction,
  keepOnCalendarAction,
  restoreAction,
  archiveAction,
}) {
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState(false); // true → bottom sheet (phones)
  const [pos, setPos] = useState(null); // anchored popover coords
  const [confirming, setConfirming] = useState(null);
  const [mounted, setMounted] = useState(false);
  const btnRef = useRef(null);

  useEffect(() => setMounted(true), []);

  // Escape closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Keep the anchored popover glued to its row while the page scrolls, rather
  // than closing on scroll — the browser scrolls the button into view when it's
  // clicked, which would otherwise slam the menu shut the instant it opened.
  // (The bottom sheet is viewport-fixed and needs none of this.)
  useEffect(() => {
    if (!open || sheet) return;
    const reposition = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      // Gone from view — nothing to anchor to any more.
      if (r.bottom < 0 || r.top > window.innerHeight) return setOpen(false);
      setPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
    };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, sheet]);

  const openMenu = () => {
    const r = btnRef.current?.getBoundingClientRect();
    // Phones get a bottom sheet (thumb-reachable); larger screens get a popover
    // anchored to the button.
    const wide = typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches;
    setSheet(!(wide && r));
    setPos(wide && r ? { top: r.bottom + 6, right: window.innerWidth - r.right } : null);
    setOpen(true);
  };

  const b = booking;
  const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;
  const comped = Number(b.total) === 0;
  const live = b.status === "held" || b.status === "reserved" || b.status === "confirmed";
  const awaitingPayment = b.status === "held" || b.status === "reserved";

  // Ordered so the likely action is first and destructive ones sit at the end.
  const items = [];
  if (b.archived) {
    items.push({
      key: "unarchive",
      label: "Unarchive",
      hint: "Put it back in the list",
      action: archiveAction,
      fields: { on: "0" },
    });
  } else {
    if (b.status === "pending") {
      items.push({ key: "review", label: "Review request", href: "/admin/requests", primary: true });
    }
    if (awaitingPayment) {
      items.push({
        key: "paid",
        label: "Mark as paid",
        primary: true,
        action: markPaidAction,
        confirm: {
          title: comped ? "Confirm this free booking?" : "Mark this booking as paid?",
          body: comped
            ? `${b.client_name}'s booking is $0, so there's nothing to collect. This confirms it on the calendar and emails them that it's on us.`
            : `This records ${money(b.total)} as received from ${b.client_name} and confirms the booking. They'll get a confirmation email. It does NOT charge their card — only do this if the money actually arrived.`,
          cta: comped ? "Confirm booking" : "Yes, mark as paid",
          pending: "Confirming…",
        },
      });
      if (b.square_invoice_id) {
        items.push({
          key: "check",
          label: "Check for payment",
          hint: "Ask Square if it's been paid",
          action: checkPaymentAction,
        });
      }
      if (b.payment_link && resendAction) {
        items.push({
          key: "resend",
          label: "Resend invoice",
          hint: "Email the payment link again",
          action: resendAction,
          confirm: {
            title: "Resend the invoice?",
            body: `This emails the payment link to ${b.client_name} (${b.client_email}) again. Nothing else changes.`,
            cta: "Send it",
            pending: "Sending…",
          },
        });
      }
      // Reprice an approved-but-unpaid single booking (e.g. remove a
      // double-charged deposit). Series pricing is edited via the series, not here.
      if (!b.series_id) {
        items.push({
          key: "edit",
          label: "Edit price & reissue",
          hint: "Void this invoice, send a corrected one",
          href: `/admin/bookings/${b.id}/edit`,
        });
      }
      // Override: keep an unpaid hold on the calendar (or re-arm the expiry).
      // Only for a single held booking (series dates never auto-expire).
      if (b.status === "held" && keepOnCalendarAction) {
        if (b.hold_expires_at) {
          items.push({
            key: "keep",
            label: "Keep on calendar",
            hint: "Stop it expiring while you sort a deal",
            action: keepOnCalendarAction,
            confirm: {
              title: "Keep this on the calendar?",
              body: `${b.client_name}'s hold will stop counting down and won't auto-expire, staying on the calendar unpaid until you mark it paid or cancel it. (Automatic payment reminders pause too.)`,
              cta: "Keep it on the calendar",
              pending: "Saving…",
            },
          });
        } else {
          items.push({
            key: "rearm",
            label: "Let it expire again",
            hint: "Re-start the payment countdown",
            action: keepOnCalendarAction,
            fields: { rearm: "1" },
          });
        }
      }
    }
    if (b.payment_link) {
      items.push({ key: "invoice", label: "Open invoice ↗", href: b.payment_link, external: true });
    }
    if (b.status === "denied") {
      items.push({
        key: "restore-pending",
        label: "Restore to pending",
        action: restoreAction,
        fields: { to: "pending" },
        confirm: {
          title: "Restore to pending?",
          body: `${b.client_name}'s request goes back to the Requests inbox to be approved or denied again. The slot isn't held until you approve it.`,
          cta: "Restore to pending",
          pending: "Restoring…",
        },
      });
      items.push({
        key: "restore-held",
        label: "Restore to held",
        action: restoreAction,
        fields: { to: "held" },
        confirm: {
          title: "Restore to held?",
          body: `This puts ${b.client_name}'s booking straight back on the calendar as approved-awaiting-payment, holding the slot. No email is sent.`,
          cta: "Restore to held",
          pending: "Restoring…",
        },
      });
    }
    if (live) {
      items.push({
        key: "cancel",
        label: "Cancel booking",
        href: `/admin/bookings/${b.id}/cancel`,
        tone: "danger",
      });
    }
    if (b.series_id && live) {
      items.push({
        key: "cancel-series",
        label: "Cancel whole series",
        href: `/admin/bookings/series/${b.series_id}/cancel`,
        tone: "danger",
      });
    }
    items.push({
      key: "archive",
      label: "Archive",
      hint: "Hide it from this list",
      tone: "danger",
      action: archiveAction,
      fields: { on: "1" },
      confirm: {
        title: "Archive this booking?",
        body: `It disappears from the list but nothing is deleted — the payment record, invoice and history are kept, and you can find it again under the Archived filter.`,
        cta: "Archive",
        pending: "Archiving…",
        tone: "danger",
      },
    });
  }

  if (!items.length) return <span className="text-xs text-ink-muted">—</span>;

  const run = (item) => {
    setOpen(false);
    if (item.confirm) setConfirming(item);
  };

  // Stable identity so ConfirmSubmit's effect doesn't re-fire on every render.
  const closeConfirm = useCallback(() => setConfirming(null), []);

  const menu = (
    <div className="admin-ui fixed inset-0 z-[60]" role="dialog" aria-modal="true">
      <button
        aria-label="Close menu"
        onClick={() => setOpen(false)}
        className={cx("absolute inset-0 animate-fade-in", sheet ? "bg-ink/40" : "bg-transparent")}
      />
      <div
        role="menu"
        aria-label={`Actions for ${b.client_name}`}
        className={cx(
          "absolute z-10 overflow-hidden border border-line bg-paper shadow-card",
          sheet
            ? "inset-x-0 bottom-0 animate-fade-in-up rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
            : "w-56 animate-fade-in rounded-xl"
        )}
        style={sheet ? undefined : { top: pos?.top, right: pos?.right }}
      >
        {sheet ? (
          <div className="border-b border-line px-4 py-3">
            <div className="text-sm font-semibold text-ink">{b.client_name}</div>
            <div className="text-xs text-ink-muted">
              {money(b.total)} · {b.status}
            </div>
          </div>
        ) : null}

        {items.map((item) =>
          item.href ? (
            item.external ? (
              <a
                key={item.key}
                href={item.href}
                target="_blank"
                rel="noreferrer"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block w-full px-4 py-3 text-left text-sm font-medium text-ink hover:bg-paper-dim sm:py-2.5"
              >
                {item.label}
              </a>
            ) : (
              <Link
                key={item.key}
                href={item.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className={cx(
                  "block w-full px-4 py-3 text-left text-sm font-medium hover:bg-paper-dim sm:py-2.5",
                  item.tone === "danger" ? "text-rust" : "text-ink"
                )}
              >
                {item.label}
              </Link>
            )
          ) : item.confirm ? (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              onClick={() => run(item)}
              className={cx(
                "block w-full px-4 py-3 text-left text-sm font-medium hover:bg-paper-dim sm:py-2.5",
                item.tone === "danger" ? "text-rust" : "text-ink"
              )}
            >
              {item.label}
              {item.hint ? (
                <span className="block text-xs font-normal text-ink-muted">{item.hint}</span>
              ) : null}
            </button>
          ) : (
            // No confirmation needed — submit straight from the menu.
            <form key={item.key} action={item.action} onSubmit={() => setOpen(false)}>
              <FilterFields filters={filters} />
              <input type="hidden" name="id" value={b.id} />
              {Object.entries(item.fields || {}).map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))}
              <button
                type="submit"
                role="menuitem"
                className="block w-full px-4 py-3 text-left text-sm font-medium text-ink hover:bg-paper-dim sm:py-2.5"
              >
                {item.label}
                {item.hint ? (
                  <span className="block text-xs font-normal text-ink-muted">{item.hint}</span>
                ) : null}
              </button>
            </form>
          )
        )}
      </div>
    </div>
  );

  const confirmDialog = confirming ? (
    <div className="admin-ui fixed inset-0 z-[70] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button
        aria-label="Cancel"
        onClick={() => setConfirming(null)}
        className="absolute inset-0 animate-fade-in bg-ink/40"
      />
      <div className="relative z-10 w-full max-w-md animate-fade-in-up rounded-t-2xl border border-line bg-paper p-6 shadow-card sm:rounded-2xl">
        <h3 className="text-lg font-semibold text-ink">{confirming.confirm.title}</h3>
        <p className="mt-1.5 text-sm text-ink-muted">{confirming.confirm.body}</p>
        <form action={confirming.action} className="mt-5 flex justify-end gap-2">
          <FilterFields filters={filters} />
          <input type="hidden" name="id" value={b.id} />
          {Object.entries(confirming.fields || {}).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(null)}>
            Never mind
          </Button>
          <ConfirmSubmit
            label={confirming.confirm.cta}
            pendingLabel={confirming.confirm.pending}
            tone={confirming.confirm.tone}
            onSettled={closeConfirm}
          />
        </form>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={openMenu}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${b.client_name}`}
        className="ml-auto flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink-soft transition hover:bg-paper-dim hover:text-ink"
      >
        <span aria-hidden="true" className="text-lg leading-none tracking-widest">⋯</span>
      </button>
      {mounted && open ? createPortal(menu, document.body) : null}
      {mounted && confirmDialog ? createPortal(confirmDialog, document.body) : null}
    </>
  );
}

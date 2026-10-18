"use client";
import { useRouter } from "next/navigation";
import { cx } from "./cx.js";

/**
 * A table row that opens `href` when you click anywhere on it — not just the
 * title. Clicks on the row's own links, buttons, menus and fields still do
 * their own thing. Same look as <Tr>, plus a pointer cursor.
 */
export default function LinkRow({ href, scroll = false, className, children, ...props }) {
  const router = useRouter();
  const open = (e) => {
    if (e.defaultPrevented || e.button !== 0) return;
    if (e.target.closest("a, button, input, select, textarea, label, [role=menu], [role=listbox], [role=dialog]")) return;
    if (window.getSelection()?.toString()) return; // selecting text, not opening
    if (e.metaKey || e.ctrlKey) {
      window.open(href, "_blank");
      return;
    }
    router.push(href, { scroll });
  };
  return (
    <tr
      onClick={open}
      className={cx("cursor-pointer border-b border-line/70 transition-colors hover:bg-paper-dim", className)}
      {...props}
    >
      {children}
    </tr>
  );
}

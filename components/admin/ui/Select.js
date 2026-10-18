"use client";
import { Children, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cx } from "./cx.js";

/**
 * The admin's dropdown — our own look instead of the phone/computer's native
 * menu. A drop-in for <select>: options come from `options=[{value,label,disabled}]`
 * or from <option>/<optgroup> children, so call sites barely change.
 *
 * Works in a plain server-action <form>: the value is carried by an input with
 * `name`, which also fires a bubbling "change" event when you pick something.
 * `submitOnChange` sends the form as soon as a choice is made (filters).
 * `onChange(value)` receives the new value itself, not an event.
 *
 * The list is drawn in a portal on <body>, so a table's scroll box or a sliding
 * panel can't clip it, and opens upward when there's no room below.
 */

const textOf = (node) => {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf(node.props.children);
  return "";
};

// <option>/<optgroup> children → [{ value, label, disabled, group }]
function parseChildren(children, group = null, out = []) {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === "option") {
      const label = textOf(child.props.children);
      out.push({
        value: child.props.value != null ? String(child.props.value) : label,
        label,
        disabled: !!child.props.disabled,
        group,
      });
    } else if (child.type === "optgroup") {
      parseChildren(child.props.children, child.props.label, out);
    } else if (child.props?.children) {
      parseChildren(child.props.children, group, out); // fragments
    }
  });
  return out;
}

const MAX_LIST = 288; // px, the list's tallest

export default function Select({
  name,
  id,
  value: controlled,
  defaultValue,
  onChange,
  options: optionsProp,
  children,
  required = false,
  disabled = false,
  placeholder = "",
  submitOnChange = false,
  size = "md",
  className,
  title,
  "aria-label": ariaLabel,
}) {
  const options = useMemo(
    () =>
      optionsProp
        ? optionsProp.map((o) => ({ value: String(o.value), label: o.label ?? String(o.value), disabled: !!o.disabled, group: o.group ?? null }))
        : parseChildren(children),
    [optionsProp, children]
  );

  // Like a native select with nothing chosen: the first option that can be picked.
  const firstPickable = () => options.find((o) => !o.disabled)?.value ?? "";
  const [inner, setInner] = useState(() => (defaultValue != null ? String(defaultValue) : firstPickable()));
  const isControlled = controlled !== undefined;
  const current = isControlled ? String(controlled ?? "") : inner;
  const selected = options.find((o) => o.value === current);

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState(null);
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const picked = useRef(false);
  const typed = useRef({ text: "", timer: null });
  const autoId = useId();
  const listId = `${id || autoId}-list`;
  const optionId = (i) => `${id || autoId}-opt-${i}`;

  useEffect(() => setMounted(true), []);

  // After a pick reaches the DOM: tell the form, and send it if asked.
  useEffect(() => {
    if (!picked.current) return;
    picked.current = false;
    const input = inputRef.current;
    if (!input) return;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    if (submitOnChange) input.form?.requestSubmit();
  }, [current, submitOnChange]);

  const choose = useCallback(
    (i) => {
      const o = options[i];
      if (!o || o.disabled) return;
      if (o.value !== current) {
        picked.current = true;
        if (!isControlled) setInner(o.value);
        onChange?.(o.value);
      }
      setOpen(false);
      buttonRef.current?.focus();
    },
    [options, current, isControlled, onChange]
  );

  const place = useCallback(() => {
    const b = buttonRef.current?.getBoundingClientRect();
    if (!b) return;
    const below = window.innerHeight - b.bottom;
    const up = below < Math.min(MAX_LIST, options.length * 40 + 12) && b.top > below;
    setPos({ left: b.left, width: b.width, top: up ? null : b.bottom + 4, bottom: up ? window.innerHeight - b.top + 4 : null });
  }, [options.length]);

  const openList = () => {
    if (disabled) return;
    const i = options.findIndex((o) => o.value === current);
    setActive(i >= 0 ? i : options.findIndex((o) => !o.disabled));
    place();
    setOpen(true);
  };

  // Keep the list under its button while the page scrolls; close on a click elsewhere.
  useLayoutEffect(() => {
    if (!open) return;
    place();
    const onDown = (e) => {
      if (buttonRef.current?.contains(e.target) || listRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onMove = (e) => {
      if (listRef.current?.contains(e.target)) return;
      place();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  // Keep the highlighted option in view.
  useEffect(() => {
    if (!open || active < 0) return;
    document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" });
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const step = (from, dir) => {
    for (let i = from + dir; i >= 0 && i < options.length; i += dir) if (!options[i].disabled) return i;
    return from;
  };
  const edge = (dir) => step(dir > 0 ? -1 : options.length, dir);

  const typeAhead = (key) => {
    const t = typed.current;
    clearTimeout(t.timer);
    t.text += key.toLowerCase();
    t.timer = setTimeout(() => (t.text = ""), 600);
    const start = open ? active : options.findIndex((o) => o.value === current);
    const order = [...options.keys()].map((k) => (k + start + (t.text.length === 1 ? 1 : 0)) % options.length);
    const hit = order.find((i) => !options[i].disabled && options[i].label.toLowerCase().startsWith(t.text));
    if (hit == null) return;
    if (open) setActive(hit);
    else choose(hit);
  };

  const onKeyDown = (e) => {
    if (disabled) return;
    const { key } = e;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(key)) {
        e.preventDefault();
        openList();
      } else if (key.length === 1 && /\S/.test(key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
        typeAhead(key);
      }
      return;
    }
    if (key === "ArrowDown") (e.preventDefault(), setActive((a) => step(a, 1)));
    else if (key === "ArrowUp") (e.preventDefault(), setActive((a) => step(a, -1)));
    else if (key === "Home") (e.preventDefault(), setActive(edge(1)));
    else if (key === "End") (e.preventDefault(), setActive(edge(-1)));
    else if (key === "Enter" || key === " ") (e.preventDefault(), choose(active));
    else if (key === "Escape") (e.preventDefault(), setOpen(false));
    else if (key === "Tab") setOpen(false);
    else if (key.length === 1 && /\S/.test(key) && !e.metaKey && !e.ctrlKey && !e.altKey) typeAhead(key);
  };

  const small = size === "sm";
  let lastGroup = null;

  return (
    <div className={cx("relative w-full min-w-0", className)}>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        disabled={disabled}
        title={title}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        className={cx(
          small
            ? "flex w-full items-center gap-1.5 rounded-lg border border-line bg-paper px-2 py-1 text-xs text-ink focus:border-brass focus:outline-none focus:ring-2 focus:ring-brass/30"
            : "field flex items-center gap-2",
          "cursor-pointer text-left disabled:cursor-not-allowed disabled:opacity-50",
          open && !small && "border-brass ring-2 ring-brass/30"
        )}
      >
        <span className={cx("min-w-0 flex-1 truncate", !selected?.label && "text-ink-muted/60")}>
          {selected?.label || placeholder || " "}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cx("shrink-0 text-ink-muted transition-transform", small ? "h-3.5 w-3.5" : "h-4 w-4", open && "rotate-180")}
        />
      </button>

      {/* What the form sends. A required one has to be a real (invisible) text
          box, since the browser won't check a hidden input. Like a native
          select, a disabled one sends nothing. */}
      {required ? (
        <input
          ref={inputRef}
          name={name}
          value={current}
          onChange={() => {}}
          required
          disabled={disabled}
          tabIndex={-1}
          aria-hidden="true"
          onFocus={() => buttonRef.current?.focus()}
          className="pointer-events-none absolute bottom-0 left-4 h-px w-px opacity-0"
        />
      ) : (
        <input ref={inputRef} type="hidden" name={name} value={current} disabled={disabled} />
      )}

      {mounted && open && pos
        ? createPortal(
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              aria-labelledby={id}
              style={{ position: "fixed", left: pos.left, width: Math.max(pos.width, 160), top: pos.top ?? undefined, bottom: pos.bottom ?? undefined, maxHeight: MAX_LIST }}
              className="admin-ui z-[80] animate-fade-in overflow-y-auto rounded-xl border border-line bg-paper py-1 shadow-card"
            >
              {options.map((o, i) => {
                const header = o.group && o.group !== lastGroup ? o.group : null;
                lastGroup = o.group;
                return (
                  <li key={`${o.value}|${i}`} role="presentation">
                    {header ? (
                      <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{header}</div>
                    ) : null}
                    <div
                      id={optionId(i)}
                      role="option"
                      aria-selected={o.value === current}
                      aria-disabled={o.disabled || undefined}
                      onMouseEnter={() => !o.disabled && setActive(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => choose(i)}
                      className={cx(
                        "mx-1 flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm",
                        o.disabled ? "cursor-default text-ink-muted/60" : "cursor-pointer text-ink",
                        i === active && !o.disabled && "bg-verde/60",
                        o.value === current && "font-semibold"
                      )}
                    >
                      <span className="min-w-0 flex-1">{o.label || " "}</span>
                      {o.value === current ? <Check className="h-4 w-4 shrink-0 text-verde-deep" aria-hidden="true" /> : null}
                    </div>
                  </li>
                );
              })}
            </ul>,
            document.body
          )
        : null}
    </div>
  );
}

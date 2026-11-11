"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ListTree, X } from "lucide-react";

/**
 * "Jump to" for long pages. Finds the page's sections by their headings (every
 * visible <h2> inside `root`), so any page gets it without being told what its
 * sections are, and shows them:
 *   - as a sidebar beside the content, when there's room for one (`rail`), or
 *   - as a small "Jump to" button in the corner that opens the list.
 * It only appears when a page has `min` or more sections.
 *
 * A part of a page with no <h2> can be marked with data-jump-section and a
 * data-jump label. A section's label is its heading's text, or a `data-jump`
 * on the heading or the card around it ("Rent & bills" rather than "$450 due"). data-jump="off"
 * leaves one out; headings in dialogs, closed <details> and nav are skipped.
 * `variant` (account | admin) only moves the corner button clear of that
 * area's phone tab bar.
 */

const SECTION = "[data-jump-section], section, article, .ac-tile, .ac-section, [data-card]";

function slug(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function visible(el) {
  return el.getClientRects().length > 0;
}

function findSections(root) {
  const used = new Set();
  const out = [];
  for (const h of root.querySelectorAll("h2, [data-jump-section][data-jump]")) {
    if (h.closest("dialog, [role='dialog'], nav, aside, details:not([open]), [data-jump='off'], .jump-nav")) continue;
    if (!visible(h)) continue;
    const box = h.matches("[data-jump-section]") ? h : h.closest(SECTION);
    const target = box && root.contains(box) && !used.has(box) ? box : h;
    if (used.has(target)) continue;
    used.add(target);
    const label = (h.dataset.jump || target.dataset?.jump || h.textContent || "").replace(/\s+/g, " ").trim();
    if (!label) continue;
    if (!target.id) {
      let id = `s-${slug(label) || "section"}`;
      for (let n = 2; document.getElementById(id); n++) id = `s-${slug(label)}-${n}`;
      target.id = id;
    }
    target.style.scrollMarginTop = "96px";
    out.push({ id: target.id, label: label.length > 42 ? `${label.slice(0, 40)}…` : label });
  }
  return out;
}

export default function JumpNav({ root = "main", rail = false, min = 3, variant = "account" }) {
  const pathname = usePathname();
  const [sections, setSections] = useState([]);
  const [active, setActive] = useState(null);
  const [railLeft, setRailLeft] = useState(null);
  const [open, setOpen] = useState(false);
  const sheet = useRef(null);
  // After a tap, keep the tapped section lit while the page glides there.
  const pinned = useRef(0);

  // Find the sections, and again whenever the page's content changes.
  useEffect(() => {
    const el = document.querySelector(root);
    if (!el) return;
    let t = null;
    const scan = () => {
      const found = findSections(el);
      setSections((prev) =>
        prev.length === found.length && prev.every((s, i) => s.id === found[i].id && s.label === found[i].label) ? prev : found
      );
    };
    scan();
    const mo = new MutationObserver(() => {
      clearTimeout(t);
      t = setTimeout(scan, 150);
    });
    mo.observe(el, { childList: true, subtree: true });
    // A <details> opening or closing shows or hides headings.
    el.addEventListener("toggle", scan, true);
    return () => {
      mo.disconnect();
      clearTimeout(t);
      el.removeEventListener("toggle", scan, true);
    };
  }, [root, pathname]);

  // Which section you're in.
  useEffect(() => {
    if (sections.length < min) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (Date.now() < pinned.current) return;
        let cur = sections[0]?.id;
        for (const s of sections) {
          const el = document.getElementById(s.id);
          if (el && el.getBoundingClientRect().top <= 140) cur = s.id;
        }
        // At the very bottom, the last section is the one you're reading.
        if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 24) cur = sections[sections.length - 1].id;
        setActive(cur);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, [sections, min]);

  // Is there room beside the content for a sidebar?
  useEffect(() => {
    if (!rail) return;
    const measure = () => {
      const el = document.querySelector(root);
      if (!el) return setRailLeft(null);
      const gutter = el.getBoundingClientRect().left + parseFloat(getComputedStyle(el).paddingLeft || "0");
      setRailLeft(gutter >= 220 ? gutter - 200 : null);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [rail, root, pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    const onDown = (e) => sheet.current && !sheet.current.contains(e.target) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  useEffect(() => setOpen(false), [pathname]);

  const jump = useCallback((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
    pinned.current = Date.now() + (still ? 150 : 1200);
    setActive(id);
    setOpen(false);
  }, []);

  if (sections.length < min) return null;

  const list = (
    <ul className="jump-list">
      {sections.map((s) => (
        <li key={s.id}>
          <button type="button" onClick={() => jump(s.id)} aria-current={s.id === active ? "true" : undefined}>
            {s.label}
          </button>
        </li>
      ))}
    </ul>
  );

  if (railLeft != null) {
    return (
      <nav className={`jump-nav jump-rail jump--${variant}`} style={{ left: railLeft }} aria-label="On this page">
        <p className="jump-title">On this page</p>
        {list}
      </nav>
    );
  }

  return (
    <div className={`jump-nav jump-float jump--${variant}`} ref={sheet}>
      {open ? (
        <nav className="jump-sheet" aria-label="On this page">
          <div className="jump-sheet-head">
            <p className="jump-title">Jump to</p>
            <button type="button" className="jump-close" onClick={() => setOpen(false)} aria-label="Close">
              <X aria-hidden="true" />
            </button>
          </div>
          {list}
        </nav>
      ) : null}
      <button type="button" className="jump-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <ListTree aria-hidden="true" />
        Jump to
      </button>
    </div>
  );
}

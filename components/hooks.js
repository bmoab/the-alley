"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

// SSR-safe layout effect.
const useIso = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Scroll-reveal: adds `.in` to every `.reveal` element as it enters the
 * viewport, staggered slightly by DOM order. Mirrors the prototype's useReveal.
 * Call once near the top of a page/section tree.
 */
export function useReveal(deps = []) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const els = Array.from(document.querySelectorAll(".reveal:not(.in)"));
    if (!els.length) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      els.forEach((el) => el.classList.add("in"));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target;
          const i = els.indexOf(el);
          el.style.transitionDelay = `${(i % 4) * 70}ms`;
          el.classList.add("in");
          io.unobserve(el);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** True once the page has scrolled past `threshold` px. */
export function useScrolled(threshold = 40) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  return scrolled;
}

/** Cycles through `words` every `ms`; returns [word, index]. */
export function useRotator(words = [], ms = 2600) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (words.length < 2) return;
    const id = setInterval(() => setI((n) => (n + 1) % words.length), ms);
    return () => clearInterval(id);
  }, [words.length, ms]);
  return [words[i] || "", i];
}

/**
 * Sizes a word to fill its parent's width. Returns a ref to attach to the
 * measured element and the computed font-size (px). Mirrors useFitWord.
 */
export function useFitWord(word, { max = 220, min = 28, fill = 0.96 } = {}) {
  const ref = useRef(null);
  const [size, setSize] = useState(max);

  useIso(() => {
    const el = ref.current;
    if (!el || !el.parentElement) return;
    let cancelled = false;

    const measure = () => {
      if (cancelled) return;
      const parent = el.parentElement;
      const avail = parent.clientWidth * fill;
      if (!avail) return;
      // Measure the word's natural width at a probe size, then scale.
      const probe = 100;
      el.style.fontSize = `${probe}px`;
      const natural = el.scrollWidth || el.getBoundingClientRect().width || 1;
      let next = (avail / natural) * probe;
      next = Math.max(min, Math.min(max, next));
      el.style.fontSize = `${next}px`;
      setSize(next);
    };

    const run = () => {
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(measure);
      } else {
        measure();
      }
    };
    run();

    const ro = new ResizeObserver(measure);
    if (el.parentElement) ro.observe(el.parentElement);
    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, [word, max, min, fill]);

  return [ref, size];
}

/** Locks body scroll while `locked` is true (for modals / lightbox / sheet). */
export function useBodyScrollLock(locked) {
  useEffect(() => {
    if (!locked) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [locked]);
}

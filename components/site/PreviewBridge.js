"use client";
import { useEffect } from "react";

/**
 * When the public site is shown inside the admin Pages preview iframe, the
 * editor posts `{type:"alley-edit-highlight", key}` as you focus a field. This
 * finds the element tagged `data-edit="<key>"`, scrolls it into view and flashes
 * a highlight. No-ops on the live site (nobody posts to it). Same-origin only.
 */
export default function PreviewBridge() {
  useEffect(() => {
    function onMessage(e) {
      if (e.origin !== window.location.origin) return;
      const data = e.data;
      if (!data || data.type !== "alley-edit-highlight" || !data.key) return;
      const el = document.querySelector(`[data-edit="${CSS.escape(data.key)}"]`);
      if (!el) return;
      // Scroll the preview's own window. (scrollIntoView would also scroll the
      // editor page around the preview — jumping it while you click a button.)
      const r = el.getBoundingClientRect();
      const top = window.scrollY + r.top - Math.max(0, (window.innerHeight - r.height) / 2);
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      el.classList.remove("alley-edit-flash");
      // Force reflow so the animation restarts if the same element is reselected.
      void el.offsetWidth;
      el.classList.add("alley-edit-flash");
      window.setTimeout(() => el.classList.remove("alley-edit-flash"), 1400);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return null;
}

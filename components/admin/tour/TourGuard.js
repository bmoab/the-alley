"use client";
import { useEffect, useState } from "react";

/**
 * Inside the account tour's preview: the tour's own pages open like the real
 * ones, but nothing leaves the tour. Paying, uploading, saving and links out
 * to the website show what they'd do in a real account instead.
 */
export default function TourGuard({ links }) {
  const [note, setNote] = useState("");
  useEffect(() => {
    let timer;
    const say = (text) => {
      setNote(text);
      clearTimeout(timer);
      timer = setTimeout(() => setNote(""), 4200);
    };
    const onClick = (e) => {
      if (e.target.closest?.('input[type="file"], label:has(input[type="file"])')) {
        e.preventDefault();
        e.stopPropagation();
        say("They'd pick a photo or file from their phone or computer here. Uploading is off in the tour.");
        return;
      }
      const a = e.target.closest?.("a");
      if (!a) return;
      const href = a.getAttribute("href") || "";
      if (href.startsWith("/admin/tour-frame")) {
        a.removeAttribute("target"); // stay in the preview
        return;
      }
      if (href.startsWith("#") && !href.startsWith("#t-")) return; // in-page jumps still work
      e.preventDefault();
      e.stopPropagation();
      const kind = href.startsWith("#t-") ? href.slice(3) : "";
      say(links[kind] || `Goes to ${href.startsWith("/") ? `alleyoncenter.com${href}` : "that page"}.`);
    };
    const onSubmit = (e) => {
      e.preventDefault();
      e.stopPropagation();
      say("Saves their changes. Nothing is saved in the tour.");
    };
    // On window, capturing: ahead of React's own listeners on the document, so
    // a blocked submit never reaches a form's server action.
    window.addEventListener("click", onClick, true);
    window.addEventListener("submit", onSubmit, true);
    return () => {
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("submit", onSubmit, true);
      clearTimeout(timer);
    };
  }, [links]);
  return note ? (
    <div role="status" className="tour-note">
      <span>In a real account</span>
      {note}
    </div>
  ) : null;
}

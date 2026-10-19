"use client";
import { useEffect, useState } from "react";

/**
 * Inside the account tour's preview: links don't go anywhere. A tap shows what
 * it would open in a real account instead, so staff can click around freely.
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
      const a = e.target.closest?.("a");
      if (!a) return;
      const href = a.getAttribute("href") || "";
      if (href.startsWith("#") && !href.startsWith("#t-")) return; // in-page jumps still work
      e.preventDefault();
      const kind = href.startsWith("#t-") ? href.slice(3) : "";
      say(links[kind] || `Goes to ${href.startsWith("/") ? `alleyoncenter.com${href}` : "that page"} on the website.`);
    };
    const onSubmit = (e) => {
      e.preventDefault();
      say("Nothing is saved in the tour.");
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
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

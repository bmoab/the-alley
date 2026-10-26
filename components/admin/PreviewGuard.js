"use client";
import { useEffect, useState } from "react";

/**
 * On a page the team is only looking at (a maker's page, as they see it):
 * forms don't send and uploads don't open, with a short note saying so.
 * Links still work. The page's actions also refuse on their own — this just
 * explains it instead of showing an error.
 */
export default function PreviewGuard({ message = "Only they can do this, from their own page." }) {
  const [note, setNote] = useState("");
  useEffect(() => {
    let timer;
    const say = () => {
      setNote(message);
      clearTimeout(timer);
      timer = setTimeout(() => setNote(""), 3800);
    };
    const onClick = (e) => {
      if (e.target.closest?.('input[type="file"], label:has(input[type="file"])')) {
        e.preventDefault();
        e.stopPropagation();
        say();
      }
    };
    const onSubmit = (e) => {
      e.preventDefault();
      e.stopPropagation();
      say();
    };
    // Capturing on window, ahead of React's own listeners, so a blocked
    // submit never reaches a server action.
    window.addEventListener("click", onClick, true);
    window.addEventListener("submit", onSubmit, true);
    return () => {
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("submit", onSubmit, true);
      clearTimeout(timer);
    };
  }, [message]);
  return note ? (
    <div
      role="status"
      style={{ position: "fixed", left: "50%", bottom: 24, transform: "translateX(-50%)", zIndex: 60, maxWidth: "calc(100vw - 32px)" }}
      className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper shadow-lg"
    >
      {note}
    </div>
  ) : null;
}

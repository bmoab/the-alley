"use client";
import { useBook } from "@/components/BookContext.js";

/** Opens the booking modal, optionally pre-selecting a space. */
export default function RequestButton({ room = null, className = "btn btn--solid", children }) {
  const { openBook } = useBook();
  return (
    <button className={className} onClick={() => openBook(room)}>
      {children}
    </button>
  );
}

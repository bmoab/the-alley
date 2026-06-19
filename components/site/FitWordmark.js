"use client";
import { useFitWord } from "@/components/hooks.js";

/** Giant wordmark that scales to fill its container width (footer backdrop). */
export default function FitWordmark({ text = "THE ALLEY ON CENTER", className = "" }) {
  const [ref, size] = useFitWord(text, { max: 320, min: 40, fill: 0.98 });
  return (
    <div className={`footer-wordmark-wrap ${className}`} aria-hidden="true">
      <span ref={ref} className="footer-wordmark" style={{ fontSize: size }}>
        {text}
      </span>
    </div>
  );
}

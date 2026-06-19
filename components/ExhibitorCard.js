"use client";
import { useState } from "react";
import PhotoSlot from "@/components/site/PhotoSlot.js";

const WORK_VARIANTS = ["verde", "", "soft"];

/** Flippable card for a past exhibitor (hover on pointer devices, click/Enter/Space). */
export default function ExhibitorCard({ ex, when = "", variant = "" }) {
  const [flipped, setFlipped] = useState(false);
  const works = ex.works || [];
  return (
    <div
      className={"ex-flip" + (flipped ? " is-flipped" : "")}
      role="button"
      tabIndex={0}
      aria-pressed={flipped}
      aria-label={`${ex.name}, ${ex.discipline}, ${when} — flip for details`}
      onClick={() => setFlipped((v) => !v)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setFlipped((v) => !v))}
    >
      <div className="ex-flip-inner">
        <div className="ex-flip-face ex-flip-front">
          <PhotoSlot src={ex.profile_photo || null} tag="" variant={variant} showTag={false} className="ex-flip-portrait" />
          <div className="ex-flip-front-meta">
            <h3 className="ex-flip-name">{ex.name}</h3>
            <p className="ex-flip-disc mono">{ex.discipline}</p>
            <p className="ex-flip-when mono">{when}</p>
          </div>
          <span className="ex-flip-hint mono">Flip ↻</span>
        </div>
        <div className="ex-flip-face ex-flip-back">
          <div className="ex-flip-back-head">
            <h3 className="ex-flip-name">{ex.name}</h3>
            <p className="ex-flip-when mono">{when}</p>
          </div>
          <p className="ex-flip-blurb">{ex.blurb}</p>
          <div className="ex-flip-works">
            {works.map((w, k) => (
              <PhotoSlot key={w.id ?? k} src={w.image_path || null} tag="" variant={WORK_VARIANTS[k % WORK_VARIANTS.length]} showTag={false} />
            ))}
          </div>
          <span className="ex-flip-hint mono">Back ↺</span>
        </div>
      </div>
    </div>
  );
}

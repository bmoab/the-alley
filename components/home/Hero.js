"use client";
import Link from "next/link";
import { useRotator, useFitWord } from "@/components/hooks.js";
import { Stripes, Bolt, Arrow } from "@/components/site/Primitives.js";

/**
 * Homepage editorial hero: kicker + rotating word (auto-fit to width) + bolt +
 * lede. `rotate` is a string[]; `eyebrow`/`lede` are strings.
 */
export default function Hero({ eyebrow, rotate = ["MUSIC", "ART", "EVENTS", "COMMUNITY"], lede }) {
  const [word, i] = useRotator(rotate, 2400);
  // Size every word to the LONGEST one so the line keeps a constant height and
  // width — the page never jumps as the word cycles.
  const longest = rotate.reduce((a, b) => (b.length > a.length ? b : a), rotate[0] || "");
  const [wordRef, wordSize] = useFitWord(longest, { max: 172, min: 34 });

  return (
    <header className="hero-b" id="top">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="hero-b-vert" src="/brand/logo-vertical-black.png" alt="" aria-hidden="true" />
      <Stripes count={4} className="hero-b-stripes" />
      <div className="wrap hero-b-inner">
        <p className="eyebrow hero-b-eyebrow">{eyebrow}</p>
        <p className="hero-b-kicker">The Alley is a home for</p>
        <div className="hero-b-rot">
          {/* Hidden sizer reserves constant space (the longest word). */}
          <span ref={wordRef} className="hero-b-word hero-b-sizer" style={{ fontSize: wordSize }} aria-hidden="true">
            {longest}
          </span>
          {/* Visible word, overlaid — same size, so no layout shift. */}
          <span key={i} className="hero-b-word hero-b-current" style={{ fontSize: wordSize }}>
            {word}
          </span>
        </div>
        <div className="hero-b-foot">
          <Bolt width={120} height={52} className="hero-b-bolt" />
          <div className="hero-b-foot-col">
            <p className="lede hero-b-lede">{lede}</p>
            <div className="hero-b-cta">
              <Link href="/calendar" className="rulelink">
                What&apos;s happening next <Arrow />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

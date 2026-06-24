import { Stripes } from "@/components/site/Primitives.js";

/**
 * Inner-page hero: eyebrow + large title + lede on the verde background, with a
 * faint vertical wordmark and a stripes motif. Server component.
 *
 * `editKeys` (optional) maps eyebrow/title/lede → a content key, stamping a
 * `data-edit` attribute so the admin Pages preview can highlight the element.
 */
export default function PageHero({ eyebrow, title, lede, kicker, editKeys = {} }) {
  return (
    <header className="pagehero">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="pagehero-vert" src="/brand/logo-vertical-black.png" alt="" aria-hidden="true" />
      <Stripes className="pagehero-stripes" count={4} />
      <div className="wrap pagehero-inner">
        {eyebrow ? <p className="eyebrow" data-edit={editKeys.eyebrow}>{eyebrow}</p> : null}
        <h1 className="pagehero-title" data-edit={editKeys.title}>{title}</h1>
        {lede ? <p className="lede pagehero-lede" data-edit={editKeys.lede}>{lede}</p> : null}
        {kicker ? <p className="gal-pull">{kicker}</p> : null}
      </div>
    </header>
  );
}

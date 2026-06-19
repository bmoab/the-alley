"use client";
import { useMemo, useState } from "react";
import { BUILDING_MAP, getFloor } from "@/lib/building-map.js";

/**
 * Interactive building directory. Entry = front elevation with two floor
 * hotspots → choosing a floor reveals that floor's SVG plan with hoverable /
 * tappable suite zones and a floating info card. Tenant↔suite mapping comes
 * from the directory rows (each tenant's `suite` + `floor`); unmatched suites
 * render as available-to-lease.
 *
 * `tenants` = directory rows. `phone` = lease contact (tel digits).
 */
export default function BuildingDirectory({ tenants = [], phone = "4355124608" }) {
  const [view, setView] = useState("entry"); // entry | lower | upper
  const [active, setActive] = useState(null);

  const bySuite = useMemo(() => {
    const m = {};
    for (const t of tenants) if (t.suite) m[t.suite] = t;
    return m;
  }, [tenants]);

  const go = (v) => {
    setActive(null);
    setView(v);
  };

  return (
    <div className="bm">
      <div className="bm-bar">
        <div className="bm-tabs">
          <button className={"bm-tab mono" + (view === "entry" ? " is-on" : "")} onClick={() => go("entry")}>Building</button>
          <button className={"bm-tab mono" + (view === "lower" ? " is-on" : "")} onClick={() => go("lower")}>Lower Floor</button>
          <button className={"bm-tab mono" + (view === "upper" ? " is-on" : "")} onClick={() => go("upper")}>Upper Floor</button>
        </div>
        {view !== "entry" ? <span className="bm-help mono">Hover or tap a suite</span> : null}
      </div>

      {view === "entry" ? (
        <BuildingFront onPick={go} />
      ) : (
        <FloorPlan floor={view} bySuite={bySuite} active={active} setActive={setActive} phone={phone} />
      )}
    </div>
  );
}

function BuildingFront({ onPick }) {
  const f = BUILDING_MAP.front;
  const [hover, setHover] = useState(null);
  return (
    <div className="bm-stage">
      <svg className="bm-svg" viewBox={f.vb || `0 0 ${f.imgW} ${f.imgH}`} role="group" aria-label="The Alley building — choose a floor">
        <image href={f.img} x="0" y="0" width={f.imgW} height={f.imgH} preserveAspectRatio="xMidYMid meet" />
        {f.bands.map((b) => (
          <g
            key={b.floor}
            className={"bm-band" + (hover === b.floor ? " is-hover" : "")}
            tabIndex={0}
            role="button"
            aria-label={b.name + " — " + b.sub}
            onMouseEnter={() => setHover(b.floor)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(b.floor)}
            onBlur={() => setHover(null)}
            onClick={() => onPick(b.floor)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onPick(b.floor))}
          >
            <rect x={b.x} y={b.y} width={b.w} height={b.h} className="bm-band-hit" />
            <g className="bm-band-tag" transform={`translate(${b.x + b.w / 2}, ${b.y + b.h / 2})`}>
              <text className="bm-band-name" textAnchor="middle">{b.name.toUpperCase()}</text>
              <text className="bm-band-go" textAnchor="middle" y="58">VIEW PLAN →</text>
            </g>
          </g>
        ))}
      </svg>
      <p className="bm-entry-hint mono">Choose a floor to explore the suites</p>
    </div>
  );
}

function linkLabel(href) {
  if (!href) return "Visit";
  if (href.startsWith("/spaces")) return "Book this space";
  if (href.startsWith("/gallery")) return "Visit the gallery";
  return "Visit";
}

function FloorPlan({ floor, bySuite, active, setActive, phone }) {
  const F = getFloor(floor);
  if (!F) return null;
  const sel = active && F.suites.find((s) => s.code === active);

  let card = null;
  if (sel) {
    const t = bySuite[sel.code];
    const cx = ((sel.x + sel.w / 2) / F.w) * 100;
    const above = sel.y / F.h > 0.32;
    const top = above ? (sel.y / F.h) * 100 : ((sel.y + sel.h) / F.h) * 100;
    const left = Math.max(21, Math.min(79, cx));
    card = { t, sel, left, top, above };
  }

  return (
    <div className="bm-stage">
      <svg className="bm-svg bm-plan" viewBox={`0 0 ${F.w} ${F.h}`} role="group" aria-label={F.name + " plan"}>
        <image href={F.img} x="0" y="0" width={F.w} height={F.h} preserveAspectRatio="xMidYMid meet" />
        {F.suites.map((s) => {
          const t = bySuite[s.code];
          const isActive = active === s.code;
          const state = s.kind === "open" || s.kind === "loft" ? "special" : t ? "filled" : "open";
          return (
            <rect
              key={s.code}
              x={s.x}
              y={s.y}
              width={s.w}
              height={s.h}
              rx="6"
              className={"bm-zone bm-zone--" + state + (isActive ? " is-active" : "")}
              tabIndex={0}
              role="button"
              aria-label={t ? `${s.code} — ${t.business_name}` : `Suite ${s.code} — available`}
              onMouseEnter={() => setActive(s.code)}
              onFocus={() => setActive(s.code)}
              onClick={() => setActive(s.code)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setActive(s.code))}
            />
          );
        })}
      </svg>

      {card ? (
        <div
          className={"bm-card" + (card.above ? " bm-card--above" : " bm-card--below")}
          style={{ left: card.left + "%", top: card.top + "%" }}
          onMouseLeave={() => setActive(null)}
        >
          <button className="bm-card-x" aria-label="Close" onClick={() => setActive(null)}>×</button>
          {card.t ? (
            <>
              <span className="bm-card-suite mono">{card.sel.kind === "open" ? "Open to all" : "Suite " + card.t.suite}</span>
              <h4 className="bm-card-name">{card.t.business_name}</h4>
              <span className="bm-card-cat mono">{card.t.category}</span>
              <p className="bm-card-blurb">{card.t.description}</p>
              {card.t.contact_link ? (
                <a
                  className="bm-card-link"
                  href={card.t.contact_link}
                  target={card.t.contact_link.startsWith("http") ? "_blank" : undefined}
                  rel={card.t.contact_link.startsWith("http") ? "noreferrer" : undefined}
                >
                  {linkLabel(card.t.contact_link)} <span className="arrow">→</span>
                </a>
              ) : null}
            </>
          ) : (
            <>
              <span className="bm-card-suite mono">Suite {card.sel.code}</span>
              <h4 className="bm-card-name">Available</h4>
              <span className="bm-card-cat mono">Now leasing</span>
              <p className="bm-card-blurb">This studio/office suite is open. We&apos;d love to show it to you.</p>
              <a className="bm-card-link" href={`tel:${phone}`}>Call to tour <span className="arrow">→</span></a>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

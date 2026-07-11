"use client";
import { useState } from "react";
import { BUILDING_MAP, getFloor } from "@/lib/building-map.js";

/**
 * Interactive building directory. Entry = front elevation with two floor
 * hotspots → choosing a floor reveals that floor's SVG plan with hoverable /
 * tappable suite zones and a floating info card.
 *
 * `zones` is a map keyed by suite zone code (from getDirectoryMapData):
 *   { name, floor, tenants ([directory row, …]), available, vacant_photo, vacant_blurb }
 * Occupied suites show the tenant's own content (or a shared-suite list if
 * two+ tenants split it); vacant suites show the owner's available-space
 * photo + blurb.
 */
export default function BuildingDirectory({ zones = {}, phone = "4355124608" }) {
  const [view, setView] = useState("entry"); // entry | lower | upper
  const [active, setActive] = useState(null);

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
        <FloorPlan floor={view} zones={zones} active={active} setActive={setActive} phone={phone} />
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

function FloorPlan({ floor, zones, active, setActive, phone }) {
  const F = getFloor(floor);
  if (!F) return null;
  const selGeo = active && F.suites.find((s) => s.code === active);

  let card = null;
  if (selGeo) {
    const data = zones[selGeo.code] || { name: selGeo.code };
    const cx = ((selGeo.x + selGeo.w / 2) / F.w) * 100;
    const above = selGeo.y / F.h > 0.32;
    const top = above ? (selGeo.y / F.h) * 100 : ((selGeo.y + selGeo.h) / F.h) * 100;
    const left = Math.max(21, Math.min(79, cx));
    card = { data, geo: selGeo, left, top, above };
  }

  return (
    <div className="bm-stage">
      <svg className="bm-svg bm-plan" viewBox={`0 0 ${F.w} ${F.h}`} role="group" aria-label={F.name + " plan"}>
        <image href={F.img} x="0" y="0" width={F.w} height={F.h} preserveAspectRatio="xMidYMid meet" />
        {F.suites.map((s) => {
          const data = zones[s.code];
          const tenants = data?.tenants || [];
          const isActive = active === s.code;
          const state = s.kind === "open" || s.kind === "loft" ? "special" : tenants.length ? "filled" : "open";
          const label = data?.name || s.code;
          const tenantLabel = tenants.length
            ? tenants.map((t) => t.business_name).join(" & ")
            : null;
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
              aria-label={tenantLabel ? `${label} — ${tenantLabel}` : `Suite ${label} — available`}
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
          {card.data.space ? (
            <>
              {card.data.space.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={card.data.space.photo}
                  alt={card.data.space.name}
                  style={{ width: "100%", height: 110, objectFit: "cover", marginBottom: 10 }}
                />
              ) : null}
              <span className="bm-card-suite mono">Rental space</span>
              <h4 className="bm-card-name">{card.data.space.name}</h4>
              {card.data.space.capacity ? <span className="bm-card-cat mono">{card.data.space.capacity}</span> : null}
              {card.data.space.blurb ? <p className="bm-card-blurb">{card.data.space.blurb}</p> : null}
              <a className="bm-card-link" href={card.data.space.href}>Book this space <span className="arrow">→</span></a>
            </>
          ) : card.data.tenants?.length === 1 ? (
            (() => {
              const t = card.data.tenants[0];
              return (
                <>
                  {t.photos?.[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={t.photos[0]}
                      alt={t.business_name}
                      style={{ width: "100%", height: 110, objectFit: "cover", marginBottom: 10 }}
                    />
                  ) : null}
                  <span className="bm-card-suite mono">
                    {card.geo.kind === "open" ? "Open to all" : `Suite ${card.data.name}`}
                  </span>
                  <h4 className="bm-card-name">{t.business_name}</h4>
                  {t.category ? <span className="bm-card-cat mono">{t.category}</span> : null}
                  {t.description ? <p className="bm-card-blurb">{t.description}</p> : null}
                  {t.href ? (
                    <a className="bm-card-link" href={t.href}>
                      See their page <span className="arrow">→</span>
                    </a>
                  ) : null}
                </>
              );
            })()
          ) : card.data.tenants?.length >= 2 ? (
            <>
              <span className="bm-card-suite mono">
                Shared suite · {card.geo.kind === "open" ? "Open to all" : `Suite ${card.data.name}`}
              </span>
              <h4 className="bm-card-name">{card.data.tenants.length} businesses</h4>
              <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0", display: "grid", gap: 10 }}>
                {card.data.tenants.map((t) => (
                  <li key={t.id} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    {t.photos?.[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={t.photos[0]}
                        alt={t.business_name}
                        style={{ width: 44, height: 44, objectFit: "cover", flexShrink: 0 }}
                      />
                    ) : (
                      <span style={{ width: 44, height: 44, background: "var(--paper-warm)", flexShrink: 0 }} aria-hidden="true" />
                    )}
                    <span style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
                      <strong style={{ fontSize: 14, lineHeight: 1.2 }}>{t.business_name}</strong>
                      {t.category ? (
                        <span className="mono" style={{ fontSize: 10, color: "var(--ink-muted)", letterSpacing: ".06em" }}>
                          {t.category}
                        </span>
                      ) : null}
                      {t.href ? (
                        <a className="bm-card-link" href={t.href} style={{ fontSize: 12, marginTop: 2 }}>
                          See their page <span className="arrow">→</span>
                        </a>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              {card.data.vacant_photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={card.data.vacant_photo}
                  alt={`Suite ${card.data.name}`}
                  style={{ width: "100%", height: 110, objectFit: "cover", marginBottom: 10 }}
                />
              ) : null}
              <span className="bm-card-suite mono">Suite {card.data.name}</span>
              <h4 className="bm-card-name">{card.data.available ? "Available" : "This suite"}</h4>
              {card.data.available ? <span className="bm-card-cat mono">Now leasing</span> : null}
              <p className="bm-card-blurb">
                {card.data.vacant_blurb ||
                  (card.data.available
                    ? "This suite is open. We'd love to show it to you."
                    : "")}
              </p>
              {card.data.available ? (
                <a className="bm-card-link" href={`tel:${phone}`}>Call to tour <span className="arrow">→</span></a>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

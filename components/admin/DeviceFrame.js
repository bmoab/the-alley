import { Monitor, Tablet, Smartphone } from "lucide-react";

/**
 * Device sizes and the iPhone / iPad outline the admin draws previews in
 * (Pages, the account tour). The page itself goes inside, at the device's real
 * screen size; the outline is scaled down to fit.
 */

// iPad and Phone are drawn inside the device's outline, at its real screen
// size (iPad Air 820×1180, iPhone 390×844), shrunk to fit the preview box.
export const DEVICES = [
  { key: "desktop", label: "Desktop", icon: Monitor, width: 1440 },
  { key: "tablet", label: "iPad", icon: Tablet, width: 820, height: 1180, bezel: 22, radius: 44, screenRadius: 22, statusBar: 24 },
  { key: "phone", label: "Phone", icon: Smartphone, width: 390, height: 844, bezel: 13, radius: 62, screenRadius: 50, statusBar: 50, island: true },
];

export function DeviceOutline({ dev, outer, scale, top = "#ffffff", children }) {
  const ink = isDark(top) ? "#fff" : "#111";
  return (
    <div
      style={{
        position: "relative",
        width: outer.w,
        height: outer.h,
        padding: dev.bezel,
        borderRadius: dev.radius,
        background: "#1d1d1f",
        boxShadow: "0 0 0 2px #3a3a3c, 0 24px 60px rgba(0,0,0,.28)",
        transform: `scale(${scale})`,
        transformOrigin: "top left",
      }}
    >
      {/* Side buttons */}
      {dev.island ? (
        <>
          <span style={{ ...button, left: -4, top: 170, height: 34 }} />
          <span style={{ ...button, left: -4, top: 228, height: 64 }} />
          <span style={{ ...button, left: -4, top: 306, height: 64 }} />
          <span style={{ ...button, right: -4, top: 250, height: 100 }} />
        </>
      ) : (
        <span style={{ ...button, right: 70, top: -4, width: 60, height: 4 }} />
      )}
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          width: dev.width,
          height: dev.height,
          borderRadius: dev.screenRadius,
          overflow: "hidden",
          background: "#fff",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            flex: "none",
            height: dev.statusBar,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: dev.island ? "8px 34px 0 42px" : "0 22px",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
            fontSize: dev.island ? 16 : 13,
            fontWeight: 600,
            color: ink,
            background: top,
            transition: "background .2s",
          }}
        >
          <span>9:41</span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Signal />
            <Battery />
          </span>
        </div>
        {children}
        {dev.island ? (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              left: "50%",
              bottom: 8,
              width: 134,
              height: 5,
              marginLeft: -67,
              borderRadius: 3,
              background: "rgba(0,0,0,.75)",
              pointerEvents: "none",
            }}
          />
        ) : null}
      </div>
      {dev.island ? (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            left: "50%",
            top: dev.bezel + 11,
            width: 124,
            height: 36,
            marginLeft: -62,
            borderRadius: 20,
            background: "#000",
          }}
        />
      ) : null}
    </div>
  );
}

const button = { position: "absolute", width: 4, borderRadius: 2, background: "#2c2c2e" };

function Signal() {
  return (
    <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor" aria-hidden="true">
      <rect x="0" y="8" width="3" height="4" rx="1" />
      <rect x="5" y="5.5" width="3" height="6.5" rx="1" />
      <rect x="10" y="3" width="3" height="9" rx="1" />
      <rect x="15" y="0" width="3" height="12" rx="1" />
    </svg>
  );
}

function Battery() {
  return (
    <svg width="27" height="13" viewBox="0 0 27 13" aria-hidden="true">
      <rect x="0.5" y="0.5" width="23" height="12" rx="3.5" fill="none" stroke="currentColor" opacity=".4" />
      <rect x="2" y="2" width="18" height="9" rx="2" fill="currentColor" />
      <rect x="25" y="4.5" width="1.6" height="4" rx="0.8" fill="currentColor" opacity=".4" />
    </svg>
  );
}

/** Is a CSS colour ("#e6ebdb", "rgb(26, 26, 23)") dark enough to need white text? */
export function isDark(color) {
  const hex = /^#([0-9a-f]{6})$/i.exec(color || "");
  const rgb = hex
    ? [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16))
    : (String(color).match(/\d+(\.\d+)?/g) || ["255", "255", "255"]).slice(0, 3).map(Number);
  const [r, g, b] = rgb;
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

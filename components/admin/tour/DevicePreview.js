"use client";
import { useEffect, useRef, useState } from "react";
import { DEVICES, DeviceOutline } from "../DeviceFrame.js";

/**
 * A page in a computer window or an iPhone, scaled down to fit the box. The
 * computer view is 1280 wide and scrolls; the phone is a real 390×844 screen.
 */
export default function DevicePreview({ src, view = "desktop", title }) {
  const boxRef = useRef(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setBox({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const phone = DEVICES.find((d) => d.key === "phone");
  const outer = { w: phone.width + phone.bezel * 2, h: phone.height + phone.bezel * 2 };
  const DESK = 1100;
  const scale = !box.w
    ? 1
    : view === "phone"
      ? Math.min(1, (box.w - 32) / outer.w, (box.h - 32) / outer.h)
      : Math.min(1, box.w / DESK);

  return (
    <div ref={boxRef} className="h-[72vh] min-h-[520px] overflow-hidden rounded-2xl border border-line bg-paper-dim xl:h-[calc(100vh-15rem)]">
      {!box.w ? null : view === "phone" ? (
        <div className="flex h-full items-center justify-center">
          <div style={{ width: outer.w * scale, height: outer.h * scale }}>
            <DeviceOutline dev={phone} outer={outer} scale={scale} top="#ffffff">
              <iframe key={src} src={src} title={title} style={{ width: phone.width, flex: "1 1 auto", minHeight: 0, border: 0 }} />
            </DeviceOutline>
          </div>
        </div>
      ) : (
        <div className="h-full" style={{ width: box.w }}>
          <iframe
            key={src}
            src={src}
            title={title}
            style={{ width: DESK, height: `${100 / scale}%`, border: 0, transform: `scale(${scale})`, transformOrigin: "top left" }}
          />
        </div>
      )}
    </div>
  );
}

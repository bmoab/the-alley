"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { resizeCrop } from "@/lib/crop.js";

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// Corners resize both ways; the edge handles make it easy to just make the
// banner taller or shorter (top/bottom) or narrower (sides).
const HANDLES = ["nw", "ne", "sw", "se", "n", "s", "e", "w"];

// Where each handle sits on the box.
function handlePos(h) {
  const v = h.includes("n") ? "n" : h.includes("s") ? "s" : "";
  const x = h.includes("w") ? "w" : h.includes("e") ? "e" : "";
  const edge = h.length === 1;
  return {
    width: edge && !x ? 28 : 16,
    height: edge && !v ? 28 : 16,
    top: v === "n" ? -8 : v === "s" ? undefined : "calc(50% - 14px)",
    bottom: v === "s" ? -8 : undefined,
    left: x === "w" ? -8 : x === "e" ? undefined : "calc(50% - 14px)",
    right: x === "e" ? -8 : undefined,
  };
}

/**
 * The crop window: the whole photo with a box to drag and resize. Everything
 * inside the box shows on the site. `minAspect`/`maxAspect` bound the box's
 * shape (width ÷ height); equal values lock it (a round portrait is 1).
 */
export default function CropModal({
  src,
  nat,
  initial,
  onCancel,
  onSave,
  title = "Crop the photo",
  help = "Drag inside the box to move it, or a corner or edge to resize it. Nothing outside the box shows on the website.",
  minAspect = 0.25,
  maxAspect = 6,
}) {
  const [box, setBox] = useState(initial);
  const [disp, setDisp] = useState({ w: 0, h: 0 });
  const dragRef = useRef(null); // { handle|null, startBox, startX, startY }
  const stageRef = useRef(null);

  // Fit the whole photo into the available modal area.
  useEffect(() => {
    function fit() {
      const maxW = Math.min(620, (window.innerWidth || 620) - 48);
      const maxH = Math.min(460, (window.innerHeight || 460) - 240);
      const scale = Math.min(maxW / nat.nw, maxH / nat.nh);
      setDisp({ w: Math.round(nat.nw * scale), h: Math.round(nat.nh * scale) });
    }
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [nat.nw, nat.nh]);

  const onMove = useCallback(
    (e) => {
      const d = dragRef.current;
      if (!d || !disp.w) return;
      const ddx = (e.clientX - d.startX) / disp.w;
      const ddy = (e.clientY - d.startY) / disp.h;
      if (d.handle) {
        setBox(resizeCrop(d.handle, d.startBox, ddx, ddy, nat.nw, nat.nh, minAspect, maxAspect));
      } else {
        const x = clamp(d.startBox.x + ddx, 0, 1 - d.startBox.w);
        const y = clamp(d.startBox.y + ddy, 0, 1 - d.startBox.h);
        setBox({ ...d.startBox, x, y });
      }
    },
    [disp.w, disp.h, nat.nw, nat.nh, minAspect, maxAspect]
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", endDrag);
  }, [onMove]);

  function startDrag(e, handle) {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { handle, startBox: box, startX: e.clientX, startY: e.clientY };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", endDrag);
  }

  useEffect(() => () => endDrag(), [endDrag]);

  const px = {
    left: box.x * disp.w,
    top: box.y * disp.h,
    width: box.w * disp.w,
    height: box.h * disp.h,
  };

  return createPortal(
    <div
      onPointerDown={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(20,16,12,.72)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          background: "var(--paper, #f7f1e6)",
          borderRadius: 16,
          padding: 20,
          maxWidth: "94vw",
          boxShadow: "0 20px 60px rgba(0,0,0,.4)",
        }}
      >
        <h3 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 700 }}>{title}</h3>
        <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--ink-soft, #5b5147)" }}>{help}</p>

        <div
          ref={stageRef}
          data-crop-stage
          style={{
            position: "relative",
            width: disp.w,
            height: disp.h,
            margin: "0 auto",
            userSelect: "none",
            touchAction: "none",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            draggable={false}
            style={{ width: disp.w, height: disp.h, display: "block", borderRadius: 6 }}
          />
          {/* Dim the photo outside the box (classic crop mask). Clipped to the
              photo — unclipped, the shadow dimmed the whole window, buttons
              and all. The box and its handles sit above it, unclipped, so a
              handle at the photo's edge can still be grabbed. */}
          <div
            aria-hidden="true"
            style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: 6, pointerEvents: "none" }}
          >
            <div
              style={{
                position: "absolute",
                left: px.left,
                top: px.top,
                width: px.width,
                height: px.height,
                boxShadow: "0 0 0 9999px rgba(20,16,12,.55)",
              }}
            />
          </div>
          <div
            onPointerDown={(e) => startDrag(e, null)}
            data-crop-box
            style={{
              position: "absolute",
              left: px.left,
              top: px.top,
              width: px.width,
              height: px.height,
              outline: "2px solid #fff",
              cursor: "move",
            }}
          >
            {(minAspect === maxAspect ? HANDLES.filter((h) => h.length === 2) : HANDLES).map((h) => (
              <span
                key={h}
                data-handle={h}
                onPointerDown={(e) => startDrag(e, h)}
                style={{
                  position: "absolute",
                  ...handlePos(h),
                  background: "#fff",
                  border: "1px solid rgba(0,0,0,.4)",
                  borderRadius: 3,
                  cursor: `${h}-resize`,
                  touchAction: "none",
                }}
              />
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              borderRadius: 999,
              border: "1px solid var(--line, #d8cdbb)",
              background: "transparent",
              padding: "9px 18px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(box)}
            style={{
              borderRadius: 999,
              border: "none",
              background: "var(--ink, #1c1815)",
              color: "var(--paper, #f7f1e6)",
              padding: "9px 20px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Use this crop
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

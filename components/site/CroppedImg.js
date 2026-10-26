"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { cropFocus, cropPlacement } from "@/lib/crop.js";

/**
 * A photo shown at the owner's crop inside its frame (the parent `.photo`):
 * the crop box fills the frame and nothing outside it shows (lib/crop.js
 * cropPlacement). Measured in the browser, since the frame's shape changes
 * with the screen; until then it's centred on the box like a normal cover.
 */
export default function CroppedImg({ src, crop, alt = "", className = "photo__img" }) {
  const ref = useRef(null);
  const [place, setPlace] = useState(null);

  useLayoutEffect(() => {
    const frame = ref.current?.parentElement;
    if (!frame) return;
    const measure = () => {
      const { width, height } = frame.getBoundingClientRect();
      if (width && height) setPlace(cropPlacement(crop, width, height));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(frame);
    return () => ro.disconnect();
  }, [crop]);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      className={className}
      src={src}
      alt={alt}
      loading="lazy"
      draggable={false}
      style={
        place
          ? // Explicit left/top/size win over the frame's inset: 0 (right and bottom are then ignored).
            { position: "absolute", left: place.left, top: place.top, width: place.width, height: place.height, maxWidth: "none", objectFit: "fill" }
          : { objectFit: "cover", objectPosition: cropFocus(crop) }
      }
    />
  );
}

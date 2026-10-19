import { useLayoutEffect, useRef, useState } from "react";

/**
 * The element's content-box size, kept current by a ResizeObserver. Inside
 * a zoomed widget (see `ModernChrome`) this is the unzoomed layout size, so
 * layout decisions stay in the widget's own coordinate space. A hidden element measures 0 x 0:
 * with `holdWhenHidden` that reading is ignored, so the last real size stands until it shows again.
 */
export function useElementSize(holdWhenHidden = false) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r && !(holdWhenHidden && r.width === 0 && r.height === 0))
        setSize((s) =>
          s.w === r.width && s.h === r.height ? s : { w: r.width, h: r.height }
        );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, w: size.w, h: size.h };
}

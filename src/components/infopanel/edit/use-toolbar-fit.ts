import { useLayoutEffect, useRef, useState } from "react";

/**
 * Whether the toolbar's groups fit on one row. The width they need is read off the inline layout
 * (a toolbar that overflows scrolls, so its `scrollWidth` is the content width) and kept, so the
 * collapsed layout can still tell when the room is back. A hidden toolbar (0 wide) holds its answer.
 */
export function useToolbarFit() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const needed = useRef(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const room = el.clientWidth;
      if (room === 0) return;
      if (!collapsed) needed.current = el.scrollWidth;
      setCollapsed(needed.current > room);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [collapsed]);
  return { ref, collapsed };
}

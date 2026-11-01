import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { LivePlacement, placementContent } from "@/components/studio/placement-content";
import type { Placement } from "@/lib/layout";
import { fixtureSensors } from "../__fixtures__";
import { MarkEmptyCtx } from "../core/primitives";
import { stressSensors } from "./stress";

// `data=stress` pushes the fixtures to their extremes; changing `data` reloads the page, so this is read once.
const SENSORS = new URLSearchParams(window.location.search).get("data") === "stress" ? stressSensors(fixtureSensors()) : fixtureSensors();
/** How long a frame's widget gets to measure and lay itself out before `onSettled` reads it. */
const SETTLE_MS = 1500;

// Frames mount as they scroll into view; `forceMountAll` (called by `__qaOverflow`) mounts the rest for good.
let forced = false;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => (listeners.add(fn), () => void listeners.delete(fn));
export function forceMountAll() {
  forced = true;
  listeners.forEach((fn) => fn());
}

interface FrameProps {
  p: Placement;
  w: number;
  h: number;
  live: boolean;
  eager: boolean;
  /** Called with the zone box once the content has mounted and settled, and again after each change of placement or size. */
  onSettled?: (box: HTMLElement) => void;
}

/** One zone's box at its exact pixel size, its content mounted lazily unless `eager`. */
export function Frame({ p, w, h, live, eager, onSettled }: FrameProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  const all = useSyncExternalStore(subscribe, () => forced, () => false);
  const mounted = eager || all || seen;
  useEffect(() => {
    if (mounted || !ref.current) return;
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setSeen(true), { rootMargin: "800px" });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [mounted]);
  const settled = useRef(onSettled);
  settled.current = onSettled;
  // The placement is rebuilt on every toolbar change, so its identity is the "something changed" signal.
  useEffect(() => {
    if (!mounted) return;
    const t = setTimeout(() => ref.current && settled.current?.(ref.current), SETTLE_MS);
    return () => clearTimeout(t);
  }, [mounted, p, w, h]);
  const frame = (content: ReactNode, scope?: CSSProperties) => (
    <div ref={ref} data-qa-box className="relative overflow-visible" style={{ width: w, height: h, ...scope }}>
      <MarkEmptyCtx.Provider value>{content}</MarkEmptyCtx.Provider>
    </div>
  );
  if (!mounted) return frame(null);
  if (live) return <LivePlacement placement={p}>{(r) => frame(r.content, r.scope)}</LivePlacement>;
  const r = placementContent(p, SENSORS, []);
  return frame(r.content, r.scope);
}

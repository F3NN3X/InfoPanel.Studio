// The page-level treatments a pack's stage can declare (Cyberspec v2, lane K): a dot grid over the page fill, and the screen's own frame, a
// line with cut corners, a notched tab at the top centre with its text, and corner reticles. Drawn by the app behind the cards like the
// other stage layers (pack-stage.tsx): click-through, hidden from assistive tech, in the screen's accent; the tab's text is a text node.
import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { CAPTION_PX, type StageChrome, type StageGrid } from "./pack-json";

/** The line sits this many px in from the screen's edge. */
const EDGE = 4;
/** A reticle's arm, px. */
const RETICLE = 14;
const DEFAULT_CUT = 24;

/** The page's dot grid: a dot of the accent every `size` px. */
export const gridPaint = (grid: StageGrid): CSSProperties => ({
  backgroundImage: `radial-gradient(circle, color-mix(in srgb, var(--w-accent) ${Math.round((grid.alpha ?? 0.18) * 100)}%, transparent) 1px, transparent 1.5px)`,
  backgroundSize: `${grid.size}px ${grid.size}px`,
  backgroundPosition: `${grid.size / 2}px ${grid.size / 2}px`,
});

/** The frame's outline, clockwise from the top left: cut corners, and the tab's notch dipping from the top edge at the centre. */
export function chromePath(w: number, h: number, chrome: StageChrome): string {
  const m = EDGE;
  const c = Math.min(chrome.cut ?? DEFAULT_CUT, (Math.min(w, h) - 2 * m) / 3);
  const pts: [number, number][] = [[m, m + c], [m + c, m]];
  if (chrome.tab) {
    const half = Math.min(chrome.tab.width, w / 2) / 2;
    const th = chrome.tab.height;
    const cx = w / 2;
    pts.push([cx - half - th, m], [cx - half, m + th], [cx + half, m + th], [cx + half + th, m]);
  }
  pts.push([w - m - c, m], [w - m, m + c], [w - m, h - m - c], [w - m - c, h - m], [m + c, h - m], [m, h - m - c]);
  return `M${pts.map(([x, y]) => `${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10}`).join(" L")} Z`;
}

/** Four L-brackets, one in each corner inside the cut. */
function reticles(w: number, h: number, cut: number): string {
  const i = EDGE + cut / 2 + 12;
  const r = RETICLE;
  return [
    `M${i} ${i + r} V${i} H${i + r}`,
    `M${w - i - r} ${i} H${w - i} V${i + r}`,
    `M${w - i} ${h - i - r} V${h - i} H${w - i - r}`,
    `M${i + r} ${h - i} H${i} V${h - i - r}`,
  ].join(" ");
}

/** The screen chrome, sized to the box it is placed in (`className`); nothing until that box is measured, unless the page's size is known. */
export function StageChromeLayer({ chrome, className = "", style, page, ...attrs }: { chrome: StageChrome; className?: string; style?: CSSProperties; page?: { width: number; height: number } } & Record<`data-${string}`, string | undefined>) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | undefined>(page ? { w: page.width, h: page.height } : undefined);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const line = `color-mix(in srgb, var(--w-accent) ${Math.round((chrome.alpha ?? 0.55) * 100)}%, transparent)`;
  const tab = chrome.tab;
  return (
    <div ref={ref} aria-hidden {...attrs} data-pack-layer="chrome" className={`pointer-events-none ${className}`} style={style}>
      {size && size.w > 0 && size.h > 0 && (
        <svg width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`} className="absolute inset-0" fill="none">
          <path d={chromePath(size.w, size.h, chrome)} stroke={line} strokeWidth="1" />
          {chrome.reticles && <path data-chrome-part="reticles" d={reticles(size.w, size.h, Math.min(chrome.cut ?? DEFAULT_CUT, size.h / 3))} stroke="var(--w-accent)" strokeWidth="1.5" />}
        </svg>
      )}
      {tab?.text && (
        <span data-chrome-part="tab" className="absolute left-1/2 flex -translate-x-1/2 items-center justify-center overflow-hidden whitespace-nowrap uppercase" style={{ top: EDGE, height: tab.height, maxWidth: tab.width, fontSize: Math.max(CAPTION_PX, Math.min(16, Math.round(tab.height * 0.45))), letterSpacing: "0.16em", color: "var(--w-accent)", fontFamily: 'ui-monospace, "JetBrains Mono", monospace' }}>
          {tab.text}
        </span>
      )}
    </div>
  );
}

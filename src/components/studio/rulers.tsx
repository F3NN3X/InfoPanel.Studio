/**
 * Ruler labels for the studio canvas: bare mono labels with a hairline tick
 * every 100 design px, floating above and beside the board. They sit at design
 * positions inside the zoomed page but counter-scale their text and offsets,
 * so the labels stay a fixed, readable size at any zoom.
 */

const EVERY = 100;

/** Label positions (design px) from 0 up to `length`, every 100. */
export function rulerMarks(length: number): number[] {
  const count = Math.floor(Math.max(0, length) / EVERY) + 1;
  return Array.from({ length: count }, (_, i) => i * EVERY);
}

const LABEL = "absolute font-ui-mono text-[10px] text-ui-4";

export function RulerLabels({ width, height, scale = 1 }: { width: number; height: number; scale?: number }) {
  const inv = 1 / (scale > 0 ? scale : 1);
  const text = { transform: `scale(${inv})`, transformOrigin: "0 0" } as const;
  return (
    <>
      <div data-shot-skip className="pointer-events-none absolute left-0 right-0 select-none" style={{ top: -30 * inv, height: 14 * inv }} aria-hidden>
        {rulerMarks(width).map((x) => (
          <span key={x} className={`${LABEL} top-0 h-full border-l border-[#2a2a31]`} style={{ left: x }}>
            <span className="inline-block pl-0.5" style={text}>
              {x}
            </span>
          </span>
        ))}
      </div>
      <div data-shot-skip className="pointer-events-none absolute bottom-0 top-0 select-none" style={{ left: -34 * inv, width: 22 * inv }} aria-hidden>
        {rulerMarks(height).map((y) => (
          <span key={y} className={`${LABEL} left-0 w-full border-t border-[#2a2a31]`} style={{ top: y }}>
            <span className="inline-block" style={text}>
              {y}
            </span>
          </span>
        ))}
      </div>
    </>
  );
}

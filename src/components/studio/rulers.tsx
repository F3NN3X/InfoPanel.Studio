/**
 * Ruler labels for the studio canvas: bare mono labels with a hairline tick
 * every 100 design px, floating above and beside the board (inside the
 * zoomed page, so they scale with it).
 */

const EVERY = 100;

/** Label positions (design px) from 0 up to `length`, every 100. */
export function rulerMarks(length: number): number[] {
  const count = Math.floor(Math.max(0, length) / EVERY) + 1;
  return Array.from({ length: count }, (_, i) => i * EVERY);
}

const LABEL = "absolute font-ui-mono text-[10px] text-ui-4";

export function RulerLabels({ width, height }: { width: number; height: number }) {
  return (
    <>
      <div data-shot-skip className="pointer-events-none absolute -top-[30px] left-0 right-0 h-3.5 select-none" aria-hidden>
        {rulerMarks(width).map((x) => (
          <span key={x} className={`${LABEL} top-0 h-full border-l border-[#2a2a31] pl-0.5`} style={{ left: x }}>
            {x}
          </span>
        ))}
      </div>
      <div data-shot-skip className="pointer-events-none absolute -left-[34px] bottom-0 top-0 w-[22px] select-none" aria-hidden>
        {rulerMarks(height).map((y) => (
          <span key={y} className={`${LABEL} left-0 w-full border-t border-[#2a2a31]`} style={{ top: y }}>
            {y}
          </span>
        ))}
      </div>
    </>
  );
}

/**
 * Fills and strokes an SVG path with an InfoPanel paint. Linear and radial
 * gradients are SVG gradients; Skia's sweep gradient has no SVG form, so it is
 * a CSS conic gradient masked by the path. Gradients are in canvas space: a
 * rotated path gets the inverse rotation on its gradient, as Skia computes the
 * gradient from the already rotated path.
 */
import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { subscribeTick } from "@/lib/ticker";
import { cssColor } from "@/lib/infopanel/render/color.ts";
import type { Paint, Stop } from "@/lib/infopanel/render/geometry.ts";

export interface PathPaintProps {
  id: string;
  d: string;
  paint: Paint;
  /** Stroke width; absent for a fill. Skia draws width 0 as a 1 px hairline. */
  stroke?: number;
  /** Rotation of the path about (cx, cy), degrees. */
  rotate?: { deg: number; cx: number; cy: number };
  /** Size of the SVG's user space, for conic gradients. */
  space: { width: number; height: number };
  /** An animated gradient: each tick writes `at(elapsedMs)` into the DOM through a ref, with no React render. */
  turn?: { start: number; at(elapsedMs: number): Paint };
}

const color = (c: string) => cssColor(c) ?? "transparent";
const stopEls = (stops: Stop[]) => stops.map((s, i) => <stop key={i} offset={s.offset} stopColor={color(s.color)} />);

const conicBackground = (paint: Extract<Paint, { kind: "conic" }>) => {
  const stops = paint.stops.map((s) => `${color(s.color)} ${+(s.offset * 100).toFixed(3)}%`).join(", ");
  return `conic-gradient(from ${paint.from}deg at ${paint.cx}px ${paint.cy}px, ${stops})`;
};

/** Writes what Gradient renders for `paint` onto an existing SVG gradient element (a turn changes only numbers). */
function writeGradient(el: Element | null, paint: Paint) {
  if (!el) return;
  if (paint.kind === "linear") {
    el.setAttribute("x1", String(paint.x1));
    el.setAttribute("y1", String(paint.y1));
    el.setAttribute("x2", String(paint.x2));
    el.setAttribute("y2", String(paint.y2));
  } else if (paint.kind === "radial") {
    el.setAttribute("cx", String(paint.cx));
    el.setAttribute("cy", String(paint.cy));
    el.setAttribute("r", String(paint.r));
  } else return;
  paint.stops.forEach((s, i) => el.children[i]?.setAttribute("offset", String(s.offset)));
}

/** Writes `paint` into the gradient markup PathPaint rendered under `el` (its defs, or the conic's div). */
export function writePaint(el: Element | null, paint: Paint) {
  if (!el) return;
  if (paint.kind === "conic") (el as HTMLElement).style.background = conicBackground(paint);
  else if (paint.kind === "diamond") {
    writeGradient(el.children[0], paint.a);
    writeGradient(el.children[1], paint.b);
  } else writeGradient(el.firstElementChild, paint);
}

function Gradient({ id, paint, inverse }: { id: string; paint: Paint; inverse?: string }): ReactNode {
  if (paint.kind === "linear") {
    return (
      <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={paint.x1} y1={paint.y1} x2={paint.x2} y2={paint.y2} gradientTransform={inverse}>
        {stopEls(paint.stops)}
      </linearGradient>
    );
  }
  if (paint.kind === "radial") {
    return (
      <radialGradient id={id} gradientUnits="userSpaceOnUse" cx={paint.cx} cy={paint.cy} r={paint.r} gradientTransform={inverse}>
        {stopEls(paint.stops)}
      </radialGradient>
    );
  }
  return null;
}

export function PathPaint({ id, d, paint, stroke, rotate, space, turn }: PathPaintProps) {
  const target = useRef<Element | null>(null);
  const latest = useRef(turn);
  latest.current = turn;
  const still = useRef(paint);
  still.current = paint;
  const turning = !!turn;
  // React rewrites a gradient's markup when its colours or centre change; put the current angle back at once.
  useLayoutEffect(() => {
    const t = latest.current;
    if (t) writePaint(target.current, t.at(performance.now() - t.start));
  });
  useEffect(() => {
    if (!turning) return;
    const stop = subscribeTick((now) => {
      const t = latest.current;
      if (t) writePaint(target.current, t.at(now - t.start));
    });
    // A turn that ends with the element still mounted leaves the static paint, not the last ticked angle.
    return () => {
      stop();
      writePaint(target.current, still.current);
    };
  }, [turning]);
  const transform = rotate && rotate.deg !== 0 ? `rotate(${rotate.deg} ${rotate.cx} ${rotate.cy})` : undefined;
  const inverse = rotate && rotate.deg !== 0 ? `rotate(${-rotate.deg} ${rotate.cx} ${rotate.cy})` : undefined;
  const width = stroke === undefined ? undefined : stroke === 0 ? 1 : stroke;
  const shape = (fill: string) =>
    width === undefined ? (
      <path d={d} fill={fill} transform={transform} />
    ) : (
      <path d={d} fill="none" stroke={fill} strokeWidth={width} transform={transform} />
    );

  switch (paint.kind) {
    case "solid":
      return shape(color(paint.color));
    case "linear":
    case "radial":
      return (
        <>
          <defs ref={target as RefObject<SVGDefsElement>}>
            <Gradient id={id} paint={paint} inverse={inverse} />
          </defs>
          {shape(`url(#${id})`)}
        </>
      );
    case "diamond":
      return (
        <g style={{ isolation: "isolate" }}>
          <defs ref={target as RefObject<SVGDefsElement>}>
            <Gradient id={`${id}a`} paint={paint.a} inverse={inverse} />
            <Gradient id={`${id}b`} paint={paint.b} inverse={inverse} />
          </defs>
          {shape(`url(#${id}a)`)}
          <g style={{ mixBlendMode: "multiply" }}>{shape(`url(#${id}b)`)}</g>
        </g>
      );
    case "conic": {
      return (
        <>
          <defs>
            <mask id={id} maskUnits="userSpaceOnUse" x={0} y={0} width={space.width} height={space.height}>
              {shape("white")}
            </mask>
          </defs>
          <foreignObject x={0} y={0} width={space.width} height={space.height} mask={`url(#${id})`} style={{ pointerEvents: "none" }}>
            <div ref={target as RefObject<HTMLDivElement>} style={{ width: "100%", height: "100%", background: conicBackground(paint) }} />
          </foreignObject>
          {/* The mask does not clip hit testing: an invisible copy of the path takes the pointer. */}
          {shape("transparent")}
        </>
      );
    }
  }
}

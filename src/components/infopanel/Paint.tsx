/**
 * Fills and strokes an SVG path with an InfoPanel paint. Linear and radial
 * gradients are SVG gradients; Skia's sweep gradient has no SVG form, so it is
 * a CSS conic gradient masked by the path. Gradients are in canvas space: a
 * rotated path gets the inverse rotation on its gradient, as Skia computes the
 * gradient from the already rotated path.
 */
import type { ReactNode } from "react";
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
}

const color = (c: string) => cssColor(c) ?? "transparent";
const stopEls = (stops: Stop[]) => stops.map((s, i) => <stop key={i} offset={s.offset} stopColor={color(s.color)} />);

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

export function PathPaint({ id, d, paint, stroke, rotate, space }: PathPaintProps) {
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
          <defs>
            <Gradient id={id} paint={paint} inverse={inverse} />
          </defs>
          {shape(`url(#${id})`)}
        </>
      );
    case "diamond":
      return (
        <g style={{ isolation: "isolate" }}>
          <defs>
            <Gradient id={`${id}a`} paint={paint.a} inverse={inverse} />
            <Gradient id={`${id}b`} paint={paint.b} inverse={inverse} />
          </defs>
          {shape(`url(#${id}a)`)}
          <g style={{ mixBlendMode: "multiply" }}>{shape(`url(#${id}b)`)}</g>
        </g>
      );
    case "conic": {
      const stops = paint.stops.map((s) => `${color(s.color)} ${+(s.offset * 100).toFixed(3)}%`).join(", ");
      return (
        <>
          <defs>
            <mask id={id} maskUnits="userSpaceOnUse" x={0} y={0} width={space.width} height={space.height}>
              {shape("white")}
            </mask>
          </defs>
          <foreignObject x={0} y={0} width={space.width} height={space.height} mask={`url(#${id})`} style={{ pointerEvents: "none" }}>
            <div
              style={{
                width: "100%",
                height: "100%",
                background: `conic-gradient(from ${paint.from}deg at ${paint.cx}px ${paint.cy}px, ${stops})`,
              }}
            />
          </foreignObject>
          {/* The mask does not clip hit testing: an invisible copy of the path takes the pointer. */}
          {shape("transparent")}
        </>
      );
    }
  }
}

/** A vector gauge as inline SVG, scaled to `width` × `height` (the spec's size by default). */
import type { CSSProperties } from "react";
import { gaugePrims, type VectorGauge } from "@/lib/infopanel/gauges/vector.ts";

export interface VectorGaugeSvgProps {
  gauge: VectorGauge;
  /** 0..1 of the range. */
  p: number;
  width?: number;
  height?: number;
  /** Unique per drawing: gradient ids live in the page's one id space. */
  id: string;
  style?: CSSProperties;
}

export function VectorGaugeSvg({ gauge, p, width = gauge.width, height = gauge.height, id, style }: VectorGaugeSvgProps) {
  const prims = gaugePrims(gauge, p);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${gauge.width} ${gauge.height}`} preserveAspectRatio="none" style={{ display: "block", overflow: "visible", ...style }}>
      {prims.map((prim, i) => {
        if (prim.kind === "path") {
          return prim.fill ? (
            <path key={i} d={prim.d} fill={prim.fill} />
          ) : (
            <path key={i} d={prim.d} fill="none" stroke={prim.stroke} strokeWidth={prim.width} strokeLinecap={prim.cap} />
          );
        }
        if (typeof prim.fill === "string") return <rect key={i} x={prim.x} y={prim.y} width={Math.max(0, prim.w)} height={Math.max(0, prim.h)} rx={prim.r} fill={prim.fill} />;
        const g = prim.fill;
        return (
          <g key={i}>
            <defs>
              <linearGradient id={`${id}-g${i}`} gradientUnits="userSpaceOnUse" x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2}>
                {[...g.stops].sort((a, b) => a.at - b.at).map((s, k) => <stop key={k} offset={`${s.at}%`} stopColor={s.color} />)}
              </linearGradient>
            </defs>
            <rect x={prim.x} y={prim.y} width={Math.max(0, prim.w)} height={Math.max(0, prim.h)} rx={prim.r} fill={`url(#${id}-g${i})`} />
          </g>
        );
      })}
    </svg>
  );
}

/**
 * A vector gauge drawn live, scaled to `width` × `height` (the spec's size by default): the shared
 * renderer's markup with theme colours as the widget variables, or an SVG template in its sandbox.
 */
import { useMemo, type CSSProperties } from "react";
import { SvgTemplateView } from "./SvgTemplateView.tsx";
import { THEME, type VectorGauge } from "@/lib/infopanel/gauges/vector.ts";
import { gaugeSvg } from "@/lib/infopanel/gauges/vector-svg.ts";

export interface VectorGaugeSvgProps {
  gauge: VectorGauge;
  /** 0..1 of the range. */
  p: number;
  width?: number;
  height?: number;
  /** Unique per drawing: gradient and filter ids live in the page's one id space. */
  id: string;
  style?: CSSProperties;
}

export function VectorGaugeSvg({ gauge, p, width = gauge.width, height = gauge.height, id, style }: VectorGaugeSvgProps) {
  // The markup is built from a normalized spec only (numbers, checked colours, escaped text).
  const safe = id.replace(/[^\w-]/g, "_");
  // A ring's face is its own layer, drawn once: the arc moving over it never repaints it.
  const faced = gauge.shape === "arc" && !!gauge.face;
  const layer = faced ? "body" : undefined;
  const html = useMemo(() => (gauge.shape === "svg" ? "" : gaugeSvg(gauge, p, { mode: "live", id: `${safe}-`, width, height, layer })), [gauge, p, safe, width, height, layer]);
  const face = useMemo(() => (faced ? gaugeSvg(gauge, 0, { mode: "live", id: `${safe}-face-`, width, height, layer: "face" }) : ""), [gauge, faced, safe, width, height]);
  if (gauge.shape === "svg") return <SvgTemplateView gauge={gauge} p={p} width={width} height={height} style={style} />;
  const box: CSSProperties = { display: "block", width, height, lineHeight: 0, overflow: "visible", ...WIDGET_SCOPE, ...style };
  if (!faced) {
    // biome-ignore lint/security/noDangerouslySetInnerHtml: gaugeSvg builds the markup from a normalized spec (numbers, checked colours, escaped text).
    return <span style={box} dangerouslySetInnerHTML={{ __html: html }} />;
  }
  return (
    <span style={{ ...box, position: "relative" }}>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: as above. */}
      <span style={{ position: "absolute", inset: 0 }} dangerouslySetInnerHTML={{ __html: face }} />
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: as above. */}
      <span style={{ position: "absolute", inset: 0 }} dangerouslySetInnerHTML={{ __html: html }} />
    </span>
  );
}

/**
 * The widget colours a gauge reads, as the app's Widget shell sets them (and its viz gallery, outside a
 * shell). The lab has no shell, and the page's own `--accent` is a shadcn HSL triple, not a colour.
 */
const WIDGET_SCOPE = Object.fromEntries(
  (["accent", "warn", "crit", "fg", "muted", "track"] as const).map((k) => [THEME[k].css.slice(4, THEME[k].css.indexOf(",")), THEME[k].hex]),
) as CSSProperties;

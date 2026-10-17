/**
 * A gauge drawn at a value inside a `size` px box: a vector or SVG-template spec live on the dashboard
 * theme, or an image sequence's frame for the value.
 */
import { useId } from "react";
import { Gauge } from "lucide-react";
import { VectorGaugeSvg } from "@/components/infopanel/VectorGaugeSvg";
import type { VectorGauge } from "@/lib/infopanel/gauges/vector";
import { frameIndex } from "@/lib/gauge-studio/sweep";

export interface GaugeViewProps {
  gauge: VectorGauge | null;
  /** An image sequence's frame URLs in value order (null: one the store can't serve). */
  frames?: (string | null)[];
  /** 0..1 of the range. */
  p: number;
  size: number;
  /** The dashboard theme as the widget variables (previewScope). */
  scope: Record<string, string>;
}

export function GaugeView({ gauge, frames, p, size, scope }: GaugeViewProps) {
  const id = useId();
  if (gauge) {
    const k = Math.min(size / gauge.width, size / gauge.height);
    return <VectorGaugeSvg gauge={gauge} p={p} id={id} width={Math.max(1, Math.floor(gauge.width * k))} height={Math.max(1, Math.floor(gauge.height * k))} style={scope} />;
  }
  const src = frames?.[frameIndex(frames.length, p)];
  if (src) return <img src={src} alt="" draggable={false} style={{ maxWidth: size, maxHeight: size }} className="object-contain" />;
  return <Gauge className="text-ui-4" style={{ width: size / 3, height: size / 3 }} strokeWidth={1.25} />;
}

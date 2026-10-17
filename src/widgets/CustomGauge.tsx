import { useId } from "react";
import { VectorGaugeSvg } from "@/components/infopanel/VectorGaugeSvg";
import { STARTERS } from "@/lib/infopanel/gauges/presets";
import { fraction, normalizeGauge, type VectorGauge } from "@/lib/infopanel/gauges/vector";
import { Widget, shell, get, num, type ShellProps, type WidgetMeta } from "./kit";

export const meta: WidgetMeta = {
  id: "CustomGauge",
  name: "Custom gauge",
  category: "Generic",
  icon: "gauge",
  prefixes: [],
  defaultSize: [1, 1],
  minSize: [1, 1],
  description: "A gauge you design on the Gauges page, driven by any one data point.",
};

export interface CustomGaugeProps extends ShellProps {
  /** The data key to bind. */
  sensor?: string;
  label?: string;
  gauge?: VectorGauge;
}

/** The spec a new Custom gauge starts from. */
export const DEFAULT_GAUGE_SPEC: VectorGauge = normalizeGauge(STARTERS.find((s) => s.name === "Theme ring with value")!.gauge);

/** A stored `gauge` setting (JSON text) as a spec; the default spec for blank or bad JSON. */
export function parseGaugeSetting(raw: unknown): VectorGauge {
  if (typeof raw !== "string" || !raw) return DEFAULT_GAUGE_SPEC;
  try {
    return normalizeGauge(JSON.parse(raw));
  } catch {
    return DEFAULT_GAUGE_SPEC;
  }
}

export default function CustomGauge(p: CustomGaugeProps) {
  const id = useId();
  const g = p.gauge ?? DEFAULT_GAUGE_SPEC;
  const v = num(get(p.data, p.sensor ?? ""));
  const frac = fraction(Number.isFinite(v) ? v : null, g.scale?.min ?? 0, g.scale?.max ?? 100);
  const label = p.label ?? p.title ?? String(p.sensor ?? "").split(".").pop()!.replace(/[_-]+/g, " ");
  return (
    <Widget {...shell(p)} title={label} icon="gauge">
      {({ w, h }) => {
        // The spec's shape, scaled to fit the body (before it is measured: its own size, clipped).
        const k = w > 0 && h > 0 ? Math.min(w / g.width, h / g.height) : 1;
        return (
          <div className="flex h-full w-full items-center justify-center overflow-hidden">
            <VectorGaugeSvg gauge={g} p={frac} id={id} width={Math.floor(g.width * k)} height={Math.floor(g.height * k)} />
          </div>
        );
      }}
    </Widget>
  );
}

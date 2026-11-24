import { useId } from "react";
import { VectorGaugeSvg } from "@/components/infopanel/VectorGaugeSvg";
import { STARTERS } from "@/lib/infopanel/gauges/presets";
import { fraction, normalizeGauge, type VectorGauge } from "@/lib/infopanel/gauges/vector";
import { Widget, shell, get, num, Metric, Ring, useSkin, type ShellProps } from "./kit";
import { meta } from "./meta/CustomGauge";

export { meta };

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

/** The label line under a gauge in a tall body, px (11px text and its gap). */
const LABEL_H = 22;

/** The spec's shape scaled to fit a `w` × `h` body (before it is measured: its own size, clipped); a `label` takes a line under it from 160px tall. */
export function FittedVectorGauge({ gauge, p, id, width, height, label }: { gauge: VectorGauge; p: number; id: string; width: number; height: number; label?: string }) {
  const named = !!label && height >= 160;
  const room = named ? height - LABEL_H : height;
  const k = width > 0 && height > 0 ? Math.min(width / gauge.width, room / gauge.height) : 1;
  return (
    <div className="flex h-full w-full flex-col items-center justify-center overflow-hidden">
      <VectorGaugeSvg gauge={gauge} p={p} id={id} width={Math.floor(gauge.width * k)} height={Math.floor(gauge.height * k)} />
      {named && <span className="mt-1.5 max-w-full shrink-0 truncate px-4 text-center text-micro text-[color:var(--w-muted)]">{label}</span>}
    </div>
  );
}

/**
 * The default gauge (the theme ring) under a Look that draws its rings as hexagons (`ring-style: hex`): the Look's own ring, in the
 * ok, warn and crit tones at the default's marks, with the reading as the Look's readout in its centre. A gauge the user designed
 * keeps its design under every Look.
 */
function LookRing({ g, v, width, height, label }: { g: VectorGauge; v: number; width: number; height: number; label?: string }) {
  const { min = 0, max = 100, unit = "", decimals = 0 } = g.scale ?? {};
  const named = !!label && height >= 160;
  const side = Math.max(0, Math.min(width, (named ? height - LABEL_H : height) - 8));
  const known = Number.isFinite(v);
  const t = !known ? "ok" : g.fill.crit !== undefined && v >= g.fill.crit ? "crit" : g.fill.warn !== undefined && v >= g.fill.warn ? "warn" : "ok";
  return (
    <div className="flex h-full w-full flex-col items-center justify-center overflow-hidden">
      <div style={{ width: side, height: side }}>
        <Ring value={known ? Math.min(max, Math.max(min, v)) - min : 0} max={max - min} t={t} className="h-full w-full">
          {/* the reading with one decimal at least, so the Look's smaller decimals show */}
          <Metric value={known ? v : "–"} unit={unit.trim() || undefined} d={Math.max(1, decimals ?? 0)} px={Math.max(11, Math.round(side * 0.2))} t={t} align="center" />
        </Ring>
      </div>
      {named && <span className="mt-1.5 max-w-full shrink-0 truncate px-4 text-center text-micro text-[color:var(--w-muted)]">{label}</span>}
    </div>
  );
}

/** The gauge's body: the Look's ring for the default gauge where the Look draws hexagons (`LookRing`), else the spec as designed. */
function GaugeBody({ g, v, id, width, height, label }: { g: VectorGauge; v: number; id: string; width: number; height: number; label?: string }) {
  const sk = useSkin();
  if (g === DEFAULT_GAUGE_SPEC && sk.ringShape === "hex") return <LookRing g={g} v={v} width={width} height={height} label={label} />;
  const frac = fraction(Number.isFinite(v) ? v : null, g.scale?.min ?? 0, g.scale?.max ?? 100);
  return <FittedVectorGauge gauge={g} p={frac} id={id} width={width} height={height} label={label} />;
}

export default function CustomGauge(p: CustomGaugeProps) {
  const id = useId();
  const g = p.gauge ?? DEFAULT_GAUGE_SPEC;
  const v = num(get(p.data, p.sensor ?? ""));
  const label = p.label ?? p.title ?? String(p.sensor ?? "").split(".").pop()!.replace(/[_-]+/g, " ");
  return (
    <Widget {...shell(p)} title={label} icon="gauge">
      {({ w, h }) => <GaugeBody g={g} v={v} id={id} width={w} height={h} label={label} />}
    </Widget>
  );
}

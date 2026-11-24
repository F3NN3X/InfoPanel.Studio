import { useFastSensors } from "@/hooks/useSensors";
import type { ModuleSettings } from "@/modules/types";
import { Widget, shell, get, num, fmt, type ShellProps } from "../kit";
import { AudioViz } from "../core/viz/AudioViz";
import { resolveLook, type VizLook } from "../core/viz/types";
import { levelOf, useVizInput } from "../core/viz/use-viz-input";
import { AUDIO, useLevelDevice } from "../shared/audio-device";
import { audioIdsIn, pickedIds, type FlowFilter } from "../shared/audio-data";
import { meta } from "./meta";
import { VisualizerSpectrum } from "./VisualizerSpectrum";

export { meta };

type Mode = "bars" | "mirror" | "radial" | "wave" | "blob" | "dots" | "line" | "scroll";

export interface VisualizerProps extends ShellProps {
  look?: ModuleSettings;
  mode?: Mode;
  /** audio-level-meter containers to draw the loudest of; default all */
  devices?: string[];
  /** Outputs or inputs only; default both. */
  flow?: FlowFilter;
  bands?: number;
  ramp?: string;
  sensitivity?: number;
  /** default true */
  peaks?: boolean;
  /** colours, shape and dynamics (`ramp` is its colour 1, `peaks` its peak caps) */
  vizLook?: Partial<VizLook>;
}

/** The sensitivity at which the shaped bands pass through unchanged. */
export const NEUTRAL_SENS = 1.4;

/** The standard layout, or the `spectrum` one the zone's Look or Layout pick names (`meta.layouts`). */
export default function Visualizer(p: VisualizerProps) {
  return p.lookLayout === "spectrum" ? <VisualizerSpectrum {...p} /> : <VisualizerCanvas {...p} />;
}

// Bands are the AudioMeter plugin's spectrum (v1.3.0+); without it every band follows the live level.
function VisualizerCanvas(p: VisualizerProps) {
  useFastSensors(AUDIO);
  const d = p.data;
  // the loudest live device of the picked ones (none picked: of all in the Show filter), like the media widget
  const dev = useLevelDevice(d, "", p.names, pickedIds(d, audioIdsIn(d, p.flow ?? "all"), p.devices));
  const k = (s: string) => num(get(d, `plugins.audio-level-meter.${dev}.${s}`));
  const name = String(get(d, `plugins.audio-level-meter.${dev}.device-name`) || "Audio").replace(/\s*\(.+\)$/, "");
  // a silent widget keeps its bars at a 6% idle height (and says so) so it does not read as broken; vizLook can override it
  const look = resolveLook({ minPx: 2, minLevel: 0.06, ...p.vizLook, count: p.bands, color1: p.ramp, peaks: p.peaks !== false, gain: (p.sensitivity ?? NEUTRAL_SENS) / NEUTRAL_SENS });
  const { get: input } = useVizInput({ data: d, device: dev, look });
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? name}
      icon="equalizer"
      studio={{ label: name, live: (k("audio-level") || 0) > 0, value: fmt(k("peak-level"), 1), unit: "dB", meters: [{ n: "L", v: k("left-channel") }, { n: "R", v: k("right-channel") }, { n: "LVL", v: k("audio-level") }] }}
      right={<span className="font-mono text-micro tabular-nums text-[color:var(--w-muted)]">{fmt(k("peak-level"), 1)} dB</span>}
    >
      <AudioViz style={p.mode ?? "bars"} look={look} input={input} className="absolute inset-0 h-full" aria-label={`${name} visualizer`} />
      {!((levelOf(d, dev) ?? 0) > 0) && <span className="pointer-events-none absolute left-2 top-1 text-micro text-[color:var(--w-faint)]">No audio</span>}
    </Widget>
  );
}

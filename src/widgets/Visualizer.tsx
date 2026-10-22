import { useFastSensors } from "@/hooks/useSensors";
import type { ModuleSettings } from "@/modules/types";
import { Widget, shell, get, num, fmt, type ShellProps, type WidgetMeta } from "./kit";
import { AudioViz } from "./core/viz/AudioViz";
import { resolveLook, type VizLook } from "./core/viz/types";
import { useVizInput } from "./core/viz/use-viz-input";
import { AUDIO, useLevelDevice } from "./audio-device";

export const meta: WidgetMeta = {
  id: "Visualizer",
  name: "Visualizer",
  category: "Audio",
  icon: "equalizer",
  prefixes: [],
  defaultSize: [3, 2],
  minSize: [1, 1],
  blurb: "Animated audio visualiser",
  tags: "spectrum bars sound",
  description: "Canvas audio visualiser driven by the level meter (L/R + level): bars, mirror, radial, wave, line, blob, LED-dot and scrolling modes at 60 fps.",
};

type Mode = "bars" | "mirror" | "radial" | "wave" | "blob" | "dots" | "line" | "scroll";

export interface VisualizerProps extends ShellProps {
  look?: ModuleSettings;
  mode?: Mode;
  /** audio-level-meter container, default "default-audio" */
  device?: string;
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

// Bands are the AudioMeter plugin's spectrum (v1.3.0+); without it every band follows the live level.
export default function Visualizer(p: VisualizerProps) {
  useFastSensors(AUDIO);
  const d = p.data;
  // Auto ("" or unset) follows the loudest live device, like the media widget
  const dev = useLevelDevice(d, p.device ?? "", p.names);
  const k = (s: string) => num(get(d, `plugins.audio-level-meter.${dev}.${s}`));
  const name = String(get(d, `plugins.audio-level-meter.${dev}.device-name`) || "Audio").replace(/\s*\(.+\)$/, "");
  const look = resolveLook({ ...p.vizLook, count: p.bands, color1: p.ramp, peaks: p.peaks !== false, gain: (p.sensitivity ?? NEUTRAL_SENS) / NEUTRAL_SENS });
  const { get: input } = useVizInput({ data: d, device: dev, look });
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? name}
      icon="equalizer"
      studio={{ label: name, live: (k("audio-level") || 0) > 0, value: fmt(k("peak-level"), 1), unit: "dB", meters: [{ n: "L", v: k("left-channel") }, { n: "R", v: k("right-channel") }, { n: "LVL", v: k("audio-level") }] }}
      right={<span className="font-mono text-[10.5px] tabular-nums text-[color:var(--w-muted)]">{fmt(k("peak-level"), 1)} dB</span>}
    >
      <AudioViz style={p.mode ?? "bars"} look={look} input={input} className="absolute inset-0 h-full" aria-label={`${name} visualizer`} />
    </Widget>
  );
}

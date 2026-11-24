// Visualizer's `spectrum` layout (look.json `layouts`, src/widgets/layouts.ts): the kit's FM receiver. The peak level as a large readout
// with its unit small over the solid-and-dotted rule, a LOCKED chip while audio plays, then the spectrum as a dense histogram in a framed
// plot (the loud bands turn the numbers' colour, the quiet ones stay the accent) over its frequency axis, and the live level on a tick
// ruler. The bands are the AudioMeter plugin's (32, 30 Hz to 16 kHz, log-spaced), drawn by the same canvas engine as the standard layout.
import { useFastSensors } from "@/hooks/useSensors";
import { SLAB_INFO_DEFAULT } from "@/looks/treatments";
import { Widget, shell, get, num, fmt } from "../kit";
import { AudioViz } from "../core/viz/AudioViz";
import { resolveLook } from "../core/viz/types";
import { levelOf, useVizInput } from "../core/viz/use-viz-input";
import { AUDIO, useLevelDevice } from "../shared/audio-device";
import { audioIdsIn, pickedIds } from "../shared/audio-data";
import { RulerRow, ToneChip } from "../shared/layout-kit";
import { Reading } from "../shared/layout-parts";
import { NEUTRAL_SENS, type VisualizerProps } from "./Visualizer";

/** The plugin's band layout (`use-viz-input.ts` CAPTURE_OPTIONS): 32 bands, log-spaced from 30 Hz to 16 kHz. */
const MIN_HZ = 30;
const MAX_HZ = 16000;

/** The axis labels: the frequency at each fifth of the plot, `30`, `150`, `1.3k`, `16k`. */
export function axisLabels(n = 5): string[] {
  return Array.from({ length: n }, (_, i) => {
    const hz = MIN_HZ * (MAX_HZ / MIN_HZ) ** (i / (n - 1));
    return hz >= 1000 ? `${fmt(hz / 1000, hz >= 10_000 ? 0 : 1)}k` : fmt(Math.round(hz / 10) * 10, 0);
  });
}

const clamp = (lo: number, v: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function VisualizerSpectrum(p: VisualizerProps) {
  useFastSensors(AUDIO);
  const d = p.data;
  const dev = useLevelDevice(d, "", p.names, pickedIds(d, audioIdsIn(d, p.flow ?? "all"), p.devices));
  const k = (s: string) => num(get(d, `plugins.audio-level-meter.${dev}.${s}`));
  const name = String(get(d, `plugins.audio-level-meter.${dev}.device-name`) || "Audio").replace(/\s*\(.+\)$/, "");
  // the loud bands in the numbers' colour (the kit's tuned band), the rest in the accent; square bars, packed close
  const look = resolveLook({ minPx: 1, minLevel: 0.04, ...p.vizLook, colorMode: "ramp", color1: "var(--w-accent)", color2: "var(--w-accent)", color3: `var(--wp-slab-info, ${SLAB_INFO_DEFAULT})`, shape: "square", gap: 0.25, count: p.bands ?? 96, peaks: p.peaks !== false, gain: (p.sensitivity ?? NEUTRAL_SENS) / NEUTRAL_SENS });
  const { get: input } = useVizInput({ data: d, device: dev, look });
  const live = (levelOf(d, dev) ?? 0) > 0;
  // the plugin's level is 0..100
  const level = k("audio-level") || 0;
  return (
    // the standard layout's header and right reading, so the card's body keeps its box (G2)
    <Widget {...shell(p)} title={p.title ?? name} icon="equalizer" right={<span className="font-mono text-micro tabular-nums text-[color:var(--w-muted)]">{fmt(k("peak-level"), 1)} dB</span>}>
      {({ w, h }) => {
        const px = clamp(20, Math.min(w / 8, h * 0.2), 64);
        const ruler = h >= 200;
        const axis = axisLabels(w >= 320 ? 5 : 3);
        return (
          <div data-layout="spectrum" className="flex h-full min-h-0 min-w-0 flex-col gap-3">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <Reading value={k("peak-level")} decimals={1} unit="dB" px={px} />
              {live && <ToneChip tone="info">Locked</ToneChip>}
            </div>
            <div className="relative flex min-h-10 min-w-0 flex-1 flex-col border border-[color:color-mix(in_srgb,var(--w-accent)_30%,transparent)] px-2 pt-2">
              <div aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: "linear-gradient(90deg, color-mix(in srgb, var(--w-accent) 14%, transparent) 1px, transparent 1px), linear-gradient(color-mix(in srgb, var(--w-accent) 14%, transparent) 1px, transparent 1px)", backgroundSize: "10% 25%" }} />
              <div className="relative min-h-0 flex-1">
                <AudioViz style="bars" look={look} input={input} className="absolute inset-0 h-full" aria-label={`${name} spectrum`} />
              </div>
              <div data-part="mono" className="relative flex justify-between py-1 text-micro tabular-nums leading-none text-[color:var(--w-muted)]">
                {axis.map((a) => (
                  <span key={a}>{a}</span>
                ))}
              </div>
              {!live && <span className="pointer-events-none absolute left-2 top-1 text-micro text-[color:var(--w-faint)]">No audio</span>}
            </div>
            {ruler && <RulerRow label="Level" value={`${fmt(level, 0)}%`} pct={level} />}
          </div>
        );
      }}
    </Widget>
  );
}

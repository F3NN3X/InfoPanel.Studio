/**
 * The editor's centre (spec §5): Change preset and the theme the colours follow, the gauge on a dark stage with
 * its range labelled at both ends, the live value and the threshold state, then play, the scrubber and "Live".
 */
import type { ReactNode } from "react";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";
import type { GaugeEntry } from "@/lib/gauge-studio/model";
import { readout } from "@/lib/gauge-studio/readout";
import { stateAt, ZONE_LABEL, bandText, type ZoneRead, type ZoneState } from "@/lib/gauge-studio/zones";
import type { VectorGauge } from "@/lib/infopanel/gauges/vector";
import { GaugeView } from "./gauge-view";
import { PlayControls } from "./play-controls";
import { PresetPicker } from "./preset-picker";
import type { GaugeViewPrefs } from "./use-gauge-view";
import type { Playback } from "./use-playback";

export interface EditorStageProps {
  gauge: VectorGauge;
  playback: Playback;
  scope: Record<string, string>;
  /** The dashboard theme's preset name; null for a custom palette. */
  themeName: string | null;
  view: GaugeViewPrefs;
  /** The preview sensor: its name, and whether it has a reading the stage can follow. */
  sensor: { name: string | null; reading: boolean; unit: string };
  zones: ZoneRead;
  onPickPreset: (preset: GaugeEntry) => void;
  onLive: (live: boolean) => void;
}

const STATE_TEXT: Record<ZoneState, string> = { normal: "text-ui-2", close: "text-ui-warn", alert: "text-ui-danger" };

export function EditorStage({ gauge, playback, scope, themeName, view, sensor, zones, onPickPreset, onLive }: EditorStageProps) {
  // A gauge with no unit of its own shows the followed sensor's while it follows it.
  const r = readout(gauge, playback.p, view.live && sensor.reading ? sensor.unit : "");
  const state = zones.thresholds ? stateAt(zones.thresholds, r.value) : null;
  const stateText = zones.thresholds && state ? `${ZONE_LABEL[state]} · ${bandText(zones.thresholds, state, r.unit)}` : null;
  const live: ReactNode = sensor.name && (
    <span className="flex shrink-0 items-center gap-2 border-l border-ui-subtle pl-3 text-caption text-ui-3">
      <span className="max-w-40 truncate">Live: {sensor.name}</span>
      <Toggle checked={view.live && sensor.reading} disabled={!sensor.reading} onChange={onLive} label={`Follow ${sensor.name}`} />
    </span>
  );
  return (
    <section aria-label="Preview" className="flex min-w-0 flex-1 flex-col bg-ui-app p-5 font-ui max-narrow:min-h-105 max-narrow:flex-none">
      <div className="flex items-center justify-between gap-3 pb-3">
        <PresetPicker scope={scope} onPick={onPickPreset} />
        <p className="truncate text-caption text-ui-3">Theme colors follow “{themeName ?? "this dashboard’s theme"}”</p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-hidden rounded-ui-lg border border-ui-subtle bg-ui-app p-4">
        <div role="img" aria-label={`Gauge preview, ${r.text}${stateText ? `, ${stateText}` : ""}`} className="flex min-h-0 items-center justify-center">
          <GaugeView gauge={gauge} p={playback.p} size={360} scope={scope} />
        </div>
        <div role="group" aria-label={`Range ${r.low} to ${r.high}`} className="grid w-full max-w-105 grid-cols-[1fr_auto_1fr] items-start gap-3">
          <span className={cn("font-ui-mono text-caption tabular-nums text-ui-3", !view.endLabels && "invisible")} aria-hidden={!view.endLabels}>
            {r.low}
          </span>
          <span className="flex flex-col items-center gap-0.5 text-center">
            <span className="font-ui-mono text-title tabular-nums text-ui-1">{r.text}</span>
            {stateText && <span className={cn("text-caption", state && STATE_TEXT[state])}>{stateText}</span>}
          </span>
          <span className={cn("text-right font-ui-mono text-caption tabular-nums text-ui-3", !view.endLabels && "invisible")} aria-hidden={!view.endLabels}>
            {r.high}
          </span>
        </div>
      </div>
      <PlayControls playback={playback} readout={r.text} trail={live || undefined} className="mt-4 w-full" />
    </section>
  );
}

/** The editor's centre: the gauge on a dark stage, play and the value scrubber, and which theme its colours follow. */
import type { VectorGauge } from "@/lib/infopanel/gauges/vector";
import { GaugeView } from "./gauge-view";
import { PlayControls } from "./play-controls";
import type { Playback } from "./use-playback";

export interface EditorStageProps {
  gauge: VectorGauge;
  playback: Playback;
  scope: Record<string, string>;
  /** The dashboard theme's preset name; null for a custom palette. */
  themeName: string | null;
}

export function EditorStage({ gauge, playback, scope, themeName }: EditorStageProps) {
  return (
    <section aria-label="Preview" className="flex min-w-0 flex-1 flex-col items-center bg-ui-app p-5 font-ui max-[899px]:min-h-[420px] max-[899px]:flex-none">
      <div className="flex w-full min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[12px] border border-ui-subtle bg-[#0b0b0e]">
        <GaugeView gauge={gauge} p={playback.p} size={360} scope={scope} />
      </div>
      <PlayControls playback={playback} className="mt-4 w-full max-w-[460px]" />
      <p className="mt-3 text-[11.5px] text-ui-4">Theme colors follow “{themeName ?? "this dashboard’s theme"}”</p>
    </section>
  );
}

/** The preview's play button (sweeps 0 → 100 → 0), value scrubber and readout. */
import type { ReactNode } from "react";
import { Pause, Play } from "lucide-react";
import { FOCUS_RING } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Playback } from "./use-playback";

export interface PlayControlsProps {
  playback: Playback;
  className?: string;
  /** The readout after the scrubber: the value in the gauge's unit ("67.5 °C"); the percentage by default. */
  readout?: string;
  /** After the readout: the editor's "Live" switch. */
  trail?: ReactNode;
}

export function PlayControls({ playback, className, readout, trail }: PlayControlsProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <button
        type="button"
        aria-label={playback.playing ? "Pause" : "Play"}
        title={playback.playing ? "Pause" : "Play: sweeps 0 to 100 and back"}
        onClick={playback.toggle}
        className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full border border-ui-strong text-ui-1 hover:bg-ui-hover", FOCUS_RING)}
      >
        {playback.playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </button>
      <input
        type="range"
        aria-label="Value"
        aria-valuetext={readout}
        min={0}
        max={100}
        step={1}
        value={Math.round(playback.p * 100)}
        onChange={(e) => playback.scrub(e.currentTarget.valueAsNumber / 100)}
        className="m-0 h-4 min-w-0 flex-1 cursor-pointer accent-[var(--ui-accent)]"
      />
      <span className={cn("shrink-0 text-right font-ui-mono tabular-nums text-caption text-ui-2", readout ? "min-w-18" : "w-9")}>{readout ?? `${Math.round(playback.p * 100)}%`}</span>
      {trail}
    </div>
  );
}

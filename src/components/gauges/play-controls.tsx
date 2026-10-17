/** The preview's play button (sweeps 0 → 100 → 0) and value scrubber. */
import { Pause, Play } from "lucide-react";
import type { Playback } from "./use-playback";

export function PlayControls({ playback, className }: { playback: Playback; className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className ?? ""}`}>
      <button
        type="button"
        aria-label={playback.playing ? "Pause" : "Play"}
        title={playback.playing ? "Pause" : "Play: sweeps 0 to 100 and back"}
        onClick={playback.toggle}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-ui-default text-ui-1 hover:bg-ui-hover"
      >
        {playback.playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </button>
      <input
        type="range"
        aria-label="Value"
        min={0}
        max={100}
        step={1}
        value={Math.round(playback.p * 100)}
        onChange={(e) => playback.scrub(e.currentTarget.valueAsNumber / 100)}
        className="m-0 h-4 min-w-0 flex-1 cursor-pointer accent-[var(--ui-accent)]"
      />
      <span className="w-9 shrink-0 text-right font-ui-mono text-[11.5px] text-ui-3">{Math.round(playback.p * 100)}%</span>
    </div>
  );
}

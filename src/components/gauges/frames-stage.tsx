/** The image-sequence editor's centre: the live preview with play and a value scrubber, and the filmstrip below it. */
import { useState } from "react";
import { clampSel, selectOne, type FrameSel } from "@/lib/gauge-studio/frame-select";
import { FramesPreview, targetFrame } from "./frames-preview";
import { FrameStrip } from "./frame-strip";
import type { FramesTools } from "./frames-tools";
import { PlayControls } from "./play-controls";
import type { Playback } from "./use-playback";

export interface FramesStageProps {
  tools: FramesTools;
  playback: Playback;
  /** The recolour preview's CSS filter. */
  filter?: string;
}

export function FramesStage({ tools, playback, filter }: FramesStageProps) {
  const [sel, setSel] = useState<FrameSel>(selectOne(0));
  const n = tools.frames.length;
  const current = targetFrame(n, playback.p);
  return (
    <div className="flex min-w-0 flex-1 flex-col bg-ui-app max-[899px]:flex-none">
      <section aria-label="Preview" className="flex min-h-0 flex-1 flex-col items-center p-5 font-ui max-[899px]:min-h-[420px] max-[899px]:flex-none">
        <div className="flex w-full min-h-0 flex-1 items-center justify-center overflow-hidden rounded-ui-lg border border-ui-subtle bg-ui-app">
          <FramesPreview frames={tools.frames} p={playback.p} speed={tools.animationSpeed} size={360} filter={filter} />
        </div>
        <PlayControls playback={playback} className="mt-4 w-full max-w-[460px]" />
        <p className="mt-3 text-[11.5px] text-ui-4">
          Frame {n === 0 ? 0 : current + 1} of {n}
          {tools.animationSpeed > 0 ? ` · eases at ${tools.animationSpeed} frames a second` : " · jumps to the frame"}
        </p>
      </section>
      <FrameStrip tools={tools} sel={clampSel(sel, n)} onSelect={setSel} current={current} filter={filter} />
    </div>
  );
}

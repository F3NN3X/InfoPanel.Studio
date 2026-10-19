/**
 * The frame filmstrip (spec §6): the frames in order, a range selected by click and shift-click, the frame
 * for the current value marked, and the tools that work on them: Reverse, Resample…, Duplicate, Replace…, Remove.
 */
import { useRef, useState, type ReactNode } from "react";
import { ArrowLeftRight, Copy, ImageUp, Shrink, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  canRemove, clampSel, duplicateEdit, isSelected, removeEdit, resampleEdit, reverseEdit, selectedIndexes, selectFrame, type FrameEdit, type FrameSel,
} from "@/lib/gauge-studio/frame-select";
import { FRAME_ACCEPT } from "./frame-files";
import type { FramesTools } from "./frames-tools";

const TOOL = "flex h-8 items-center gap-1.5 rounded-[7px] border border-ui-default px-2.5 text-[12px] text-ui-1 hover:bg-ui-hover disabled:pointer-events-none disabled:opacity-40";

export interface FrameStripProps {
  tools: FramesTools;
  sel: FrameSel;
  onSelect: (sel: FrameSel) => void;
  /** The frame the current value picks. */
  current: number;
  /** The recolour preview's CSS filter. */
  filter?: string;
}

export function FrameStrip({ tools, sel, onSelect, current, filter }: FrameStripProps) {
  const n = tools.frames.length;
  const picked = clampSel(sel, n);
  const idx = selectedIndexes(picked, n);
  const input = useRef<HTMLInputElement>(null);
  const [resampling, setResampling] = useState<number | null>(null);
  const off = !tools.ready || tools.busy !== null;
  const apply = (what: string, e: FrameEdit) => {
    tools.reorder(what, e.order);
    onSelect(e.sel);
  };
  const scope = idx.length > 1 ? "the selected frames" : "every frame";

  return (
    <section aria-label="Frames" className="w-full shrink-0 border-t border-ui-subtle bg-ui-panel font-ui">
      <div className="flex min-h-11 flex-wrap items-center gap-2 px-4 py-2">
        <span className="mr-1 font-ui-mono text-[11px] text-ui-4">
          {n} frame{n === 1 ? "" : "s"}
          {idx.length > 1 ? ` · ${idx.length} selected` : ""}
        </span>
        <Tool label="Reverse" title={`Reverse the order of ${scope}`} disabled={off || n < 2} onClick={() => apply("Reversing", reverseEdit(n, picked))}>
          <ArrowLeftRight className="h-3.5 w-3.5" />
        </Tool>
        <Tool label="Resample…" title={`Pick N frames evenly from ${scope}; the first and last stay`} disabled={off || n < 2} onClick={() => setResampling(resampling === null ? (idx.length > 1 ? idx.length : n) : null)}>
          <Shrink className="h-3.5 w-3.5" />
        </Tool>
        <Tool label="Duplicate" title="Repeat each selected frame once" disabled={off || n < 1} onClick={() => apply("Duplicating", duplicateEdit(n, picked))}>
          <Copy className="h-3.5 w-3.5" />
        </Tool>
        <Tool label="Replace…" title="Pick image files for the selected frames, in order" disabled={off || n < 1} onClick={() => input.current?.click()}>
          <ImageUp className="h-3.5 w-3.5" />
        </Tool>
        <Tool label="Remove" title={canRemove(n, picked) ? "Remove the selected frames" : "A gauge keeps at least one frame"} disabled={off || !canRemove(n, picked)} onClick={() => apply("Removing", removeEdit(n, picked))}>
          <Trash2 className="h-3.5 w-3.5" />
        </Tool>
        <input
          ref={input}
          type="file"
          multiple
          accept={FRAME_ACCEPT}
          className="hidden"
          onChange={(e) => {
            // Copied first: clearing the input empties its live FileList.
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            if (files.length) void tools.replace(idx, files);
          }}
        />
        {tools.note && (
          <span role="status" className="min-w-0 truncate text-[12px] text-ui-3">
            {tools.note}
          </span>
        )}
      </div>
      {resampling !== null && (
        <form
          className="flex items-center gap-2 px-4 pb-2 text-[12px] text-ui-3"
          onSubmit={(e) => {
            e.preventDefault();
            apply("Resampling", resampleEdit(n, picked, resampling));
            setResampling(null);
          }}
        >
          <label className="flex items-center gap-2">
            Resample {scope} to
            <input
              type="number"
              min={1}
              max={1000}
              value={resampling}
              autoFocus
              onChange={(e) => setResampling(Math.max(1, Math.min(1000, Math.round(e.currentTarget.valueAsNumber) || 1)))}
              className="h-7 w-[72px] rounded-md border border-ui-strong bg-ui-hover px-2 text-[12px] text-ui-1 outline-none focus:border-ui-accent"
            />
            frames
          </label>
          <button type="submit" className="h-7 rounded-[7px] bg-ui-inverse px-2.5 text-[12px] font-medium text-ui-inverse-fg hover:opacity-90">
            Resample
          </button>
          <button type="button" onClick={() => setResampling(null)} className="h-7 rounded-[7px] border border-ui-default px-2.5 text-[12px] text-ui-1 hover:bg-ui-hover">
            Cancel
          </button>
        </form>
      )}
      <ol className="flex gap-1.5 overflow-x-auto px-4 pb-3 pt-1">
        {tools.frames.map((src, i) => (
          <li key={i} className="shrink-0">
            <button
              type="button"
              aria-pressed={isSelected(picked, i)}
              aria-current={i === current ? "true" : undefined}
              title={i === current ? `Frame ${i + 1}: shown at this value` : `Frame ${i + 1}`}
              onClick={(e) => onSelect(selectFrame(picked, i, e.shiftKey))}
              className={cn(
                "relative block h-[68px] w-[76px] overflow-hidden rounded-[7px] border bg-[#0b0b0e] outline-none focus-visible:border-ui-accent",
                isSelected(picked, i) ? "border-ui-accent shadow-[0_0_0_1px_var(--ui-accent)]" : "border-ui-subtle hover:border-ui-menu",
              )}
            >
              {src ? (
                <img src={src} alt="" loading="lazy" decoding="async" draggable={false} style={{ filter }} className="h-full w-full object-contain" />
              ) : (
                <span className="grid h-full place-items-center text-[10px] text-ui-danger">missing</span>
              )}
              <span className="absolute bottom-0 left-0 rounded-tr-[5px] bg-black/60 px-1 font-ui-mono text-[9.5px] text-ui-2">{i + 1}</span>
              {i === current && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-ui-accent shadow-[0_0_0_1.5px_#0b0b0e]" />}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Tool({ label, title, disabled, onClick, children }: { label: string; title: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" title={title} disabled={disabled} onClick={onClick} className={TOOL}>
      {children}
      {label}
    </button>
  );
}

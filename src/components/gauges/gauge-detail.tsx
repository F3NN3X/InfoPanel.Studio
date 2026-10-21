/**
 * The Library's Gauges right pane (spec §6): a large live preview with play and a scrubber, name,
 * "kind · where", copies placed, the primary action (Customise a copy / Edit) and Add to canvas,
 * Duplicate and Export.
 */
import { useState } from "react";
import { Pencil, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { KIND_LABEL, type GaugeEntry } from "@/lib/gauge-studio/model";
import type { GaugeActions } from "./gauge-actions";
import { GaugeView } from "./gauge-view";
import { PlayControls } from "./play-controls";
import { usePlayback } from "./use-playback";

export interface GaugeDetailProps {
  entry: GaugeEntry;
  /** Shown in a bottom sheet (a narrow viewport): fills it instead of a 320 px side column. */
  sheet?: boolean;
  /** Copies placed, for a library gauge (undefined for the others). */
  copies?: number;
  scope: Record<string, string>;
  /** What the pane's buttons do: the same actions as the card's menu. */
  actions: GaugeActions;
}

export function GaugeDetail({ entry, sheet, copies, scope, actions }: GaugeDetailProps) {
  const playback = usePlayback();
  const [picking, setPicking] = useState(false);
  const { edit, secondary } = actions;
  const choices = secondary.find((a) => a.choices)?.choices ?? [];
  return (
    <aside
      aria-label="Gauge details"
      className={cn(
        "flex flex-col gap-4 overflow-y-auto bg-ui-panel p-4 font-ui",
        sheet ? "min-w-0 flex-1" : "w-[320px] shrink-0 border-l border-ui-subtle",
      )}
    >
      <div className={cn("flex aspect-square w-full items-center justify-center rounded-[10px] border border-ui-subtle bg-[#0b0b0e]", sheet && "max-w-[248px] self-center")}>
        <GaugeView gauge={entry.gauge} frames={entry.frames} p={playback.p} size={248} scope={scope} />
      </div>
      <PlayControls playback={playback} />
      <div>
        <div className="truncate text-[14px] font-semibold text-ui-1">{entry.name}</div>
        <div className="font-ui-mono text-[11px] text-ui-4">
          {KIND_LABEL[entry.kind]} · {entry.where}
        </div>
        {copies !== undefined && (
          <div className="mt-1 text-[12px] text-ui-3">
            {copies === 0 ? "Not placed yet" : `${copies} cop${copies === 1 ? "y" : "ies"} placed`}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={edit.run}
          className="flex h-[34px] w-full items-center justify-center gap-2 rounded-[8px] bg-ui-inverse px-3 text-[12.5px] font-medium text-ui-inverse-fg hover:opacity-90"
        >
          <Pencil className="h-4 w-4" strokeWidth={1.75} />
          {entry.source.kind === "preset" ? "Customise a copy" : "Edit"}
        </button>
        <div className="grid grid-cols-2 gap-2 [&>*:last-child:nth-child(odd)]:col-span-2">
          {secondary.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={a.choices ? () => setPicking((p) => !p) : a.run}
              disabled={a.disabled}
              title={a.title}
              className={cn("flex h-[34px] items-center justify-center gap-2 rounded-[8px] border border-ui-default px-3 text-[12.5px] text-ui-1 hover:bg-ui-hover disabled:pointer-events-none disabled:opacity-40")}
            >
              <a.icon className="h-4 w-4" strokeWidth={1.75} />
              {a.label}
            </button>
          ))}
        </div>
        {picking && choices.length > 0 && (
          <div role="group" aria-label="Canvas zones" className="flex flex-col gap-1 rounded-[8px] border border-ui-subtle p-1">
            {choices.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setPicking(false);
                  c.run();
                }}
                className="h-8 truncate rounded-[6px] px-2 text-left text-[12.5px] text-ui-1 hover:bg-ui-hover"
              >
                {c.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

export function EmptyDetail() {
  return (
    <aside className="flex w-[320px] shrink-0 flex-col items-center justify-center gap-2 border-l border-ui-subtle bg-ui-panel p-6 text-center font-ui text-[12.5px] text-ui-4">
      <Eye className="h-5 w-5" />
      Select a gauge to see it here. Double-click one to edit it.
    </aside>
  );
}

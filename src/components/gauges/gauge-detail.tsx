/**
 * The Gauges view's right pane (spec §5): a large live preview (the sweep with play and a scrubber, or the sensor
 * picked in "Preview with"), name, "kind · where", copies placed, and the actions: Add to canvas, Customise a copy
 * or Edit, Duplicate and Export. A sensor here is only for looking: it is not saved with the gauge.
 */
import { useState } from "react";
import { Eye, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SensorField } from "@/components/studio/widget-editor/sensor-field";
import { cn } from "@/lib/utils";
import { KIND_LABEL, type GaugeEntry } from "@/lib/gauge-studio/model";
import type { GaugeActions } from "./gauge-actions";
import { GaugeView } from "./gauge-view";
import { PlayControls } from "./play-controls";
import { useGaugeView, useLiveReading } from "./use-gauge-view";
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
  /** The preview sensor picker's "Open data explorer". */
  onOpenSources: () => void;
}

export function GaugeDetail({ entry, sheet, copies, scope, actions, onOpenSources }: GaugeDetailProps) {
  const playback = usePlayback();
  const [view, setView] = useGaugeView();
  const live = useLiveReading(view, entry.min, entry.max);
  const [picking, setPicking] = useState(false);
  const { edit, secondary } = actions;
  const choices = secondary.find((a) => a.choices)?.choices ?? [];
  const [add, ...rest] = secondary;
  return (
    <aside
      aria-label="Gauge details"
      className={cn(
        "flex flex-col gap-4 overflow-y-auto bg-ui-panel p-4 font-ui",
        sheet ? "min-w-0 flex-1" : "w-80 shrink-0 border-l border-ui-subtle",
      )}
    >
      <div className={cn("flex aspect-square w-full items-center justify-center rounded-ui-lg border border-ui-subtle bg-ui-app", sheet && "max-w-62 self-center")}>
        <GaugeView gauge={entry.gauge} frames={entry.frames} p={live.p ?? playback.p} size={248} scope={scope} />
      </div>
      {live.p === null && <PlayControls playback={playback} />}
      <div>
        <div className="truncate text-title font-medium text-ui-1">{entry.name}</div>
        <div className="font-ui-mono text-micro text-ui-3">
          {KIND_LABEL[entry.kind]} · {entry.where}
        </div>
        {copies !== undefined && (
          <div className="mt-1 text-caption text-ui-3">
            {copies === 0 ? "Not placed yet" : `${copies} cop${copies === 1 ? "y" : "ies"} placed`}
          </div>
        )}
      </div>
      <SensorField label="Preview with" hint="Only for looking: not saved with the gauge" value={view.sensor ?? undefined} onChange={(sensor) => setView({ sensor: sensor ?? null })} onOpenExplorer={onOpenSources} />
      <div className="flex flex-col gap-2">
        {add && (
          <Button
            onClick={add.choices ? () => setPicking((p) => !p) : add.run}
            disabled={add.disabled}
            title={add.title}
            aria-expanded={add.choices ? picking : undefined}
            icon={<Plus strokeWidth={1.5} />}
            className="w-full"
          >
            {add.label}
          </Button>
        )}
        {picking && choices.length > 0 && (
          <div role="group" aria-label="Canvas zones" className="flex flex-col gap-1 rounded-ui-md border border-ui-subtle p-1">
            {choices.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setPicking(false);
                  c.run();
                }}
                className="h-8 truncate rounded-ui-sm px-2 text-left text-body text-ui-1 hover:bg-ui-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent"
              >
                {c.label}
              </button>
            ))}
          </div>
        )}
        <Button onClick={edit.run} icon={<Pencil strokeWidth={1.5} />} className="w-full">
          {entry.source.kind === "preset" ? "Customize a copy" : "Edit"}
        </Button>
        <div className="flex flex-wrap items-center justify-center gap-1">
          {rest.map((a) => (
            <Button key={a.label} variant="ghost" small onClick={a.run} disabled={a.disabled} title={a.title} icon={<a.icon strokeWidth={1.5} />}>
              {a.label}
            </Button>
          ))}
        </div>
      </div>
      {entry.source.kind === "preset" && <p className="text-caption leading-snug text-ui-3">Customizing saves a draft copy in your library as soon as you change something, so leaving the editor never loses work</p>}
    </aside>
  );
}

export function EmptyDetail() {
  return (
    <aside className="flex w-80 shrink-0 flex-col items-center justify-center gap-2 border-l border-ui-subtle bg-ui-panel p-6 text-center font-ui text-body text-ui-3">
      <Eye className="h-5 w-5" />
      Select a gauge to see it here. Double-click one to edit it.
    </aside>
  );
}

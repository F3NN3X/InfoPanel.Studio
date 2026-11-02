/** The Fill part: mode, the colour or colour stops, thresholds, and following the dashboard theme. */
import { Plus, X } from "lucide-react";
import { customOf, follows, followOf } from "@/lib/gauge-studio/paint";
import type { ColorStop, FillMode, VectorGauge } from "@/lib/infopanel/gauges/vector";
import { ChoiceRow, ColorInput, NumRow, PaintRow, ToggleRow, type InspectorProps } from "./rows";

const MODES = [
  { value: "solid", label: "Solid" },
  { value: "gradient", label: "Gradient" },
  { value: "zones", label: "Zones" },
  { value: "thresholds", label: "Thresholds" },
] as const;

const MAX_STOPS = 16;

export function FillInspector({ g, set }: InspectorProps) {
  const fill = g.fill;
  const patch = (p: Partial<VectorGauge["fill"]>, key?: string) => set({ ...g, fill: { ...fill, ...p } }, key);
  const solid = fill.mode === "solid" || fill.mode === "thresholds";
  return (
    <div className="space-y-1">
      <ChoiceRow
        label="Mode"
        value={fill.mode}
        options={MODES}
        // Thresholds start at the values the fields show.
        onChange={(mode: FillMode) => patch({ mode, ...(mode === "thresholds" ? { warn: fill.warn ?? 70, crit: fill.crit ?? 90 } : {}) })}
      />
      {solid && (
        <>
          <ToggleRow label="Follow dashboard theme" value={follows(fill.color)} onChange={(on) => patch({ color: on ? followOf(fill.color) : customOf(fill.color) })} />
          <PaintRow label={fill.mode === "thresholds" ? "OK color" : "Color"} value={fill.color} onChange={(color) => patch({ color }, "color")} />
        </>
      )}
      {fill.mode === "thresholds" && (
        <>
          <NumRow label="Warning from" value={fill.warn ?? 70} onChange={(warn) => patch({ warn }, "warn")} />
          <NumRow label="Critical from" value={fill.crit ?? 90} onChange={(crit) => patch({ crit }, "crit")} />
          <p className="text-[11.5px] leading-snug text-ui-4">In scale values (Value text › Scale). Warning and critical follow the theme.</p>
        </>
      )}
      {fill.mode === "gradient" && (
        <ToggleRow
          label="Over the filled part"
          value={fill.over === "fill"}
          onChange={(on) => {
            const { over: _, ...rest } = fill;
            set({ ...g, fill: on ? { ...rest, over: "fill" } : rest });
          }}
        />
      )}
      {!solid && <Stops mode={fill.mode} stops={fill.stops} onChange={(stops, key) => patch({ stops }, key)} />}
    </div>
  );
}

function Stops({ mode, stops, onChange }: { mode: FillMode; stops: ColorStop[]; onChange: (stops: ColorStop[], key?: string) => void }) {
  const edit = (i: number, p: Partial<ColorStop>, key: string) => onChange(stops.map((s, k) => (k === i ? { ...s, ...p } : s)), `${key}${i}`);
  return (
    <div className="space-y-1 pt-1">
      {stops.map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-9 shrink-0 text-[11.5px] text-ui-4">{mode === "zones" ? "from" : "at"}</span>
          <input
            type="number"
            aria-label={`Stop ${i + 1} position`}
            min={0}
            max={100}
            value={s.at}
            onChange={(e) => edit(i, { at: Math.min(100, Math.max(0, e.currentTarget.valueAsNumber || 0)) }, "at")}
            className="h-[26px] w-[58px] rounded-md border border-ui-default bg-ui-app px-1.5 text-right font-ui-mono text-[11.5px] text-ui-1 outline-none focus:border-ui-accent"
          />
          <span className="text-[11.5px] text-ui-4">%</span>
          <ColorInput label={`Stop ${i + 1}`} value={s.color} onChange={(color) => edit(i, { color }, "color")} />
          <span className="flex-1" />
          {stops.length > 1 && (
            <button type="button" title="Remove this stop" aria-label={`Remove stop ${i + 1}`} onClick={() => onChange(stops.filter((_, k) => k !== i))} className="grid h-6 w-6 place-items-center rounded-md text-ui-4 hover:bg-ui-hover hover:text-ui-1">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}
      {stops.length < MAX_STOPS && (
        <button type="button" onClick={() => onChange([...stops, { at: 100, color: "#FFFFFF" }])} className="mt-1 flex h-(--ui-h-control) items-center gap-1.5 rounded-[7px] border border-ui-default px-2.5 text-caption text-ui-1 hover:bg-ui-hover">
          <Plus className="h-3.5 w-3.5" /> Add stop
        </button>
      )}
    </div>
  );
}

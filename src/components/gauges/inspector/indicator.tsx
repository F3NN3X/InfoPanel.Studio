/** Track, and the needle (arc) or marker (bar). */
import { DEFAULT_GAUGE, type NeedleStyle } from "@/lib/infopanel/gauges/vector";
import { ChoiceRow, NumRow, PaintRow, type InspectorProps } from "./rows";

const NEEDLE_STYLES: { value: NeedleStyle; label: string }[] = [
  { value: "taper", label: "Taper" },
  { value: "line", label: "Line" },
  { value: "arrow", label: "Arrow" },
  { value: "blade", label: "Blade" },
];

export function TrackInspector({ g, set }: InspectorProps) {
  return (
    <div className="space-y-1">
      <PaintRow label="Colour" value={g.track ?? DEFAULT_GAUGE.track!} onChange={(track) => set({ ...g, track }, "track")} />
      <NumRow label="Opacity" value={g.trackOpacity ?? 1} min={0} max={1} step={0.05} onChange={(trackOpacity) => set({ ...g, trackOpacity }, "track-opacity")} />
    </div>
  );
}

/** The needle of an arc, or the marker across a bar (the same `needle` field). */
export function NeedleInspector({ g, set }: InspectorProps) {
  const n = g.needle!;
  const patch = (p: Partial<typeof n>, key?: string) => set({ ...g, needle: { ...n, ...p } }, key);
  return (
    <div className="space-y-1">
      {g.shape === "arc" && <ChoiceRow label="Style" value={n.style ?? "taper"} options={NEEDLE_STYLES} onChange={(style) => patch({ style })} />}
      <PaintRow label="Colour" value={n.color} onChange={(color) => patch({ color }, "color")} />
      <NumRow label="Length" value={n.length} min={0.1} max={1.2} step={0.05} onChange={(length) => patch({ length }, "length")} />
      <NumRow label="Width" value={n.width} min={1} max={64} unit="px" onChange={(width) => patch({ width }, "width")} />
    </div>
  );
}

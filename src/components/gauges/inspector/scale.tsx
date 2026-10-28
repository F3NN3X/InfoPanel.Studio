/** Ticks (with minor ticks) and the labels at the major ticks. */
import { MINOR, TICKS } from "@/lib/gauge-studio/parts";
import type { Ticks } from "@/lib/infopanel/gauges/vector";
import { NumRow, PaintRow, TextRow, ToggleRow, type InspectorProps } from "./rows";

export function TicksInspector({ g, set }: InspectorProps) {
  const t = g.ticks ?? TICKS;
  const patch = (p: Partial<Ticks>, key?: string) => set({ ...g, ticks: { ...t, ...p } }, key);
  const minor = t.minor;
  const { minor: _, ...major } = t;
  return (
    <div className="space-y-1">
      <NumRow label="Count" value={t.count} min={3} max={21} onChange={(count) => patch({ count }, "count")} />
      <NumRow label="Length" value={t.length} min={1} max={60} unit="px" onChange={(length) => patch({ length }, "length")} />
      <NumRow label="Width" value={t.width} min={0.5} max={16} step={0.5} unit="px" onChange={(width) => patch({ width }, "width")} />
      <PaintRow label="Color" value={t.color} onChange={(color) => patch({ color }, "color")} />
      <ToggleRow label="Minor ticks" value={!!minor} onChange={(on) => set({ ...g, ticks: on ? { ...t, minor: MINOR } : major })} />
      {minor && (
        <>
          <NumRow label="Between majors" value={minor.count} min={1} max={20} onChange={(count) => patch({ minor: { ...minor, count } }, "minor-count")} />
          <NumRow label="Minor length" value={minor.length} min={1} max={60} unit="px" onChange={(length) => patch({ minor: { ...minor, length } }, "minor-length")} />
          <PaintRow label="Minor color" value={minor.color} onChange={(color) => patch({ minor: { ...minor, color } }, "minor-color")} />
        </>
      )}
    </div>
  );
}

/** The scale values at the major ticks. */
export function LabelsInspector({ g, set }: InspectorProps) {
  const l = g.ticks!.labels!;
  const patch = (p: Partial<typeof l>, key?: string) => set({ ...g, ticks: { ...g.ticks!, labels: { ...l, ...p } } }, key);
  return (
    <div className="space-y-1">
      <NumRow label="Size" value={l.size} min={4} max={60} unit="px" onChange={(size) => patch({ size }, "size")} />
      <PaintRow label="Color" value={l.color} onChange={(color) => patch({ color }, "color")} />
      <TextRow label="Font" value={l.font} placeholder="Default font" onChange={(font) => patch({ font: font.replace(/[^\w\s,'.-]/g, "").slice(0, 80) }, "font")} />
    </div>
  );
}

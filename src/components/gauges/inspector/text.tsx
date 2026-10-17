/** Value text (with the scale it reads) and the title. */
import { TEXT, TITLE } from "@/lib/gauge-studio/parts";
import { DEFAULT_SCALE } from "@/lib/infopanel/gauges/parts";
import type { Scale, Title, ValueText } from "@/lib/infopanel/gauges/vector";
import { HeightRow, NumRow, PaintRow, PickRow, TextRow, type InspectorProps } from "./rows";

const font = (v: string) => v.replace(/[^\w\s,'.-]/g, "").slice(0, 80);

const DECIMALS = [
  { value: "auto", label: "Auto" },
  ...[0, 1, 2, 3, 4].map((d) => ({ value: String(d), label: String(d) })),
];

/** The range the labels, text and thresholds read: shown whether or not the value text is on. */
export function ScaleRows({ g, set }: InspectorProps) {
  const s = g.scale ?? DEFAULT_SCALE;
  const patch = (p: Partial<Scale>, key?: string) => set({ ...g, scale: { ...s, ...p } }, key);
  return (
    <div className="space-y-1">
      <NumRow label="Scale min" value={s.min} onChange={(min) => patch({ min }, "min")} />
      <NumRow label="Scale max" value={s.max} onChange={(max) => patch({ max }, "max")} />
      <TextRow label="Unit" value={s.unit} placeholder="%, °C, rpm…" onChange={(unit) => patch({ unit: unit.slice(0, 16) }, "unit")} />
      <PickRow label="Decimals" value={s.decimals === null ? "auto" : String(s.decimals)} options={DECIMALS} onChange={(d) => patch({ decimals: d === "auto" ? null : Number(d) })} />
    </div>
  );
}

export function TextInspector({ g, set }: InspectorProps) {
  const t = g.text;
  const patch = (p: Partial<ValueText>, key?: string) => set({ ...g, text: { ...(t ?? TEXT), ...p } }, key);
  return (
    <div className="space-y-3">
      {t && (
        <div className="space-y-1">
          <TextRow label="Format" value={t.format} placeholder="{value}{unit}" onChange={(format) => patch({ format: format.slice(0, 40) }, "format")} />
          <NumRow label="Size" value={t.size} min={4} max={200} unit="px" onChange={(size) => patch({ size }, "size")} />
          <PaintRow label="Colour" value={t.color} onChange={(color) => patch({ color }, "color")} />
          <NumRow label="Weight" value={t.weight} min={100} max={900} step={100} onChange={(weight) => patch({ weight }, "weight")} />
          <HeightRow label="Position" value={t.y} onChange={(y) => patch({ y }, "y")} />
          <TextRow label="Font" value={t.font} placeholder="Default font" onChange={(f) => patch({ font: font(f) }, "font")} />
        </div>
      )}
      <ScaleRows g={g} set={set} />
    </div>
  );
}

export function TitleInspector({ g, set }: InspectorProps) {
  const t = g.title ?? TITLE;
  const patch = (p: Partial<Title>, key?: string) => set({ ...g, title: { ...t, ...p } }, key);
  return (
    <div className="space-y-1">
      <TextRow label="Text" value={t.text} onChange={(text) => patch({ text: text.slice(0, 60) }, "text")} />
      <NumRow label="Size" value={t.size} min={4} max={200} unit="px" onChange={(size) => patch({ size }, "size")} />
      <PaintRow label="Colour" value={t.color} onChange={(color) => patch({ color }, "color")} />
      <HeightRow label="Position" value={t.y} onChange={(y) => patch({ y }, "y")} />
    </div>
  );
}

/** Decor: background, rings (arc), pattern and icon row (bar), the centre icon. */
import { BACKGROUND } from "@/lib/gauge-studio/parts";
import { DEFAULT_ICON, DEFAULT_ICONS, DEFAULT_PATTERN, DEFAULT_RINGS } from "@/lib/infopanel/gauges/shapes";
import { GAUGE_ICONS, type Background, type CentreIcon, type IconRow, type Pattern, type Rings } from "@/lib/infopanel/gauges/vector";
import { ChoiceRow, HeightRow, NumRow, PaintRow, PickRow, ToggleRow, type InspectorProps } from "./rows";

const ICON_OPTIONS = GAUGE_ICONS.map((i) => ({ value: i, label: i[0].toUpperCase() + i.slice(1) }));

export function BackgroundInspector({ g, set }: InspectorProps) {
  const b = g.background ?? BACKGROUND;
  const patch = (p: Partial<Background>, key?: string) => set({ ...g, background: { ...b, ...p } }, key);
  const rectangular = g.shape === "bar" || g.shape === "grid" || g.liquid?.container === "rect";
  return (
    <div className="space-y-1">
      <ToggleRow label="Fill" value={b.color !== null} onChange={(on) => patch({ color: on ? BACKGROUND.color : null })} />
      {b.color !== null && <PaintRow label="Fill colour" value={b.color} onChange={(color) => patch({ color }, "color")} />}
      <ToggleRow label="Border" value={!!b.border} onChange={(on) => patch({ border: on ? { color: "muted", width: 2 } : null })} />
      {b.border && (
        <>
          <PaintRow label="Border colour" value={b.border.color} onChange={(color) => patch({ border: { ...b.border!, color } }, "border-color")} />
          <NumRow label="Border width" value={b.border.width} min={0.5} max={32} step={0.5} unit="px" onChange={(width) => patch({ border: { ...b.border!, width } }, "border-width")} />
        </>
      )}
      {rectangular && <NumRow label="Corner radius" value={b.radius} min={0} max={200} unit="px" onChange={(radius) => patch({ radius }, "radius")} />}
    </div>
  );
}

export function RingsInspector({ g, set }: InspectorProps) {
  const r = g.rings ?? DEFAULT_RINGS;
  const patch = (p: Partial<Rings>, key?: string) => set({ ...g, rings: { ...r, ...p } }, key);
  return (
    <div className="space-y-1">
      <NumRow label="Count" value={r.count} min={1} max={8} onChange={(count) => patch({ count }, "count")} />
      <NumRow label="Spacing" value={r.spacing} min={1} max={64} unit="px" onChange={(spacing) => patch({ spacing }, "spacing")} />
      <NumRow label="Width" value={r.width} min={0.5} max={32} step={0.5} unit="px" onChange={(width) => patch({ width }, "width")} />
      <PaintRow label="Colour" value={r.color} onChange={(color) => patch({ color }, "color")} />
      <NumRow label="Opacity" value={r.opacity} min={0} max={1} step={0.05} onChange={(opacity) => patch({ opacity }, "opacity")} />
    </div>
  );
}

export function PatternInspector({ g, set }: InspectorProps) {
  const p = g.pattern ?? DEFAULT_PATTERN;
  const patch = (x: Partial<Pattern>, key?: string) => set({ ...g, pattern: { ...p, ...x } }, key);
  return (
    <div className="space-y-1">
      <ChoiceRow label="Style" value={p.style} options={[{ value: "stripes", label: "Stripes" }, { value: "dots", label: "Dots" }, { value: "chevrons", label: "Chevrons" }]} onChange={(style) => patch({ style })} />
      <PaintRow label="Colour" value={p.color} onChange={(color) => patch({ color }, "color")} />
      <NumRow label="Opacity" value={p.opacity} min={0} max={1} step={0.05} onChange={(opacity) => patch({ opacity }, "opacity")} />
      <NumRow label="Size" value={p.size} min={4} max={256} unit="px" onChange={(size) => patch({ size }, "size")} />
      <NumRow label="Moves every" value={p.speed} min={0} max={30} step={0.5} unit="s" onChange={(speed) => patch({ speed }, "speed")} />
    </div>
  );
}

export function IconsInspector({ g, set }: InspectorProps) {
  const i = g.icons ?? DEFAULT_ICONS;
  const patch = (p: Partial<IconRow>, key?: string) => set({ ...g, icons: { ...i, ...p } }, key);
  return (
    <div className="space-y-1">
      <PickRow label="Icon" value={i.name} options={ICON_OPTIONS} onChange={(name) => patch({ name })} />
      <NumRow label="Count" value={i.count} min={1} max={20} onChange={(count) => patch({ count }, "count")} />
      <ToggleRow label="The one at the value fills partly" value={i.progressive} onChange={(progressive) => patch({ progressive })} />
    </div>
  );
}

export function CentreIconInspector({ g, set }: InspectorProps) {
  const i = g.icon ?? DEFAULT_ICON;
  const patch = (p: Partial<CentreIcon>, key?: string) => set({ ...g, icon: { ...i, ...p } }, key);
  return (
    <div className="space-y-1">
      <PickRow label="Icon" value={i.name} options={ICON_OPTIONS} onChange={(name) => patch({ name })} />
      <NumRow label="Size" value={i.size} min={4} max={400} unit="px" onChange={(size) => patch({ size }, "size")} />
      <PaintRow label="Colour" value={i.color} onChange={(color) => patch({ color }, "color")} />
      <HeightRow label="Position" value={i.y} onChange={(y) => patch({ y }, "y")} />
    </div>
  );
}

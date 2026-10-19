/** The Shape part: type, size, and what each shape adds (arc sweep, bar orientation, liquid tank, grid cells, SVG file). */
import { useRef } from "react";
import { useToast } from "@/components/ui/toast";
import { withShape } from "@/lib/gauge-studio/parts";
import { importGauge } from "@/lib/gauge-studio/import-file";
import { DEFAULT_GRID, DEFAULT_LIQUID, CELL_BORDER } from "@/lib/infopanel/gauges/shapes";
import type { Grid, Liquid, VectorGauge } from "@/lib/infopanel/gauges/vector";
import { ChoiceRow, NumRow, PaintRow, PickRow, ToggleRow, type InspectorProps } from "./rows";

const SHAPES = [
  { value: "arc", label: "Arc" },
  { value: "bar", label: "Bar" },
  { value: "liquid", label: "Liquid" },
  { value: "grid", label: "Grid" },
  { value: "svg", label: "SVG" },
] as const;

export function ShapeInspector({ g, set }: InspectorProps) {
  const patch = (p: Partial<VectorGauge>, key?: string) => set({ ...g, ...p }, key);
  return (
    <div className="space-y-1">
      <ChoiceRow label="Type" value={g.shape} options={SHAPES} onChange={(shape) => set(withShape(g, shape))} />
      <NumRow label="Width" value={g.width} min={20} max={1024} unit="px" onChange={(width) => patch({ width }, "width")} />
      <NumRow label="Height" value={g.height} min={20} max={1024} unit="px" onChange={(height) => patch({ height }, "height")} />
      {g.shape === "svg" && <TemplateRows g={g} set={set} />}
      {g.shape !== "svg" && <ToggleRow label="Reverse" value={g.reverse} onChange={(reverse) => patch({ reverse })} />}
      {g.shape === "arc" && <ArcRows g={g} set={set} />}
      {g.shape === "bar" && <BarRows g={g} set={set} />}
      {(g.shape === "arc" || g.shape === "bar") && (
        <>
          <NumRow label="Segments" value={g.segments} min={0} max={200} onChange={(segments) => patch({ segments }, "segments")} />
          {g.segments > 0 && <NumRow label="Gap" value={g.gap} min={0} max={100} unit={g.shape === "arc" ? "°" : "px"} onChange={(gap) => patch({ gap }, "gap")} />}
        </>
      )}
      {g.shape === "liquid" && <LiquidRows g={g} set={set} />}
      {g.shape === "grid" && <GridRows g={g} set={set} />}
    </div>
  );
}

function ArcRows({ g, set }: InspectorProps) {
  const patch = (p: Partial<VectorGauge>, key?: string) => set({ ...g, ...p }, key);
  return (
    <>
      <NumRow label="Sweep" value={g.sweep} min={90} max={360} unit="°" onChange={(sweep) => patch({ sweep }, "sweep")} />
      <NumRow label="Start" value={g.start} min={-360} max={360} unit="°" onChange={(start) => patch({ start }, "start")} />
      <NumRow label="Thickness" value={g.thickness} min={1} max={120} unit="px" onChange={(thickness) => patch({ thickness }, "thickness")} />
      <ToggleRow label="Rounded ends" value={g.rounded} onChange={(rounded) => patch({ rounded })} />
    </>
  );
}

function BarRows({ g, set }: InspectorProps) {
  const patch = (p: Partial<VectorGauge>, key?: string) => set({ ...g, ...p }, key);
  const { radius: _, ...square } = g;
  return (
    <>
      <ChoiceRow
        label="Direction"
        value={g.orientation}
        options={[{ value: "horizontal", label: "Across" }, { value: "vertical", label: "Up" }]}
        onChange={(orientation) => patch({ orientation })}
      />
      <NumRow label="Thickness" value={g.thickness} min={1} max={200} unit="px" onChange={(thickness) => patch({ thickness }, "thickness")} />
      <ToggleRow label="Rounded ends" value={g.rounded} onChange={(rounded) => set({ ...square, rounded })} />
      <ToggleRow label="Corner radius" value={g.radius !== undefined} onChange={(on) => set(on ? { ...g, radius: 4, rounded: false } : square)} />
      {g.radius !== undefined && <NumRow label="Radius" value={g.radius} min={0} max={100} unit="px" onChange={(radius) => patch({ radius }, "radius")} />}
    </>
  );
}

function LiquidRows({ g, set }: InspectorProps) {
  const liquid = g.liquid ?? DEFAULT_LIQUID;
  const patch = (p: Partial<Liquid>, key?: string) => set({ ...g, liquid: { ...liquid, ...p } }, key);
  return (
    <>
      <ChoiceRow
        label="Tank"
        value={liquid.container}
        options={[{ value: "circle", label: "Round" }, { value: "rect", label: "Rect" }, { value: "diamond", label: "Diamond" }, { value: "hexagon", label: "Hex" }]}
        onChange={(container) => patch({ container })}
      />
      {liquid.container === "rect" && <NumRow label="Corner radius" value={liquid.radius} min={0} max={200} unit="px" onChange={(radius) => patch({ radius }, "radius")} />}
      <NumRow label="Inset" value={liquid.inset} min={0} max={100} unit="px" onChange={(inset) => patch({ inset }, "inset")} />
    </>
  );
}

function GridRows({ g, set }: InspectorProps) {
  const grid = g.grid ?? DEFAULT_GRID;
  const patch = (p: Partial<Grid>, key?: string) => set({ ...g, grid: { ...grid, ...p } }, key);
  const { border: _, ...plain } = grid;
  return (
    <>
      <NumRow label="Rows" value={grid.rows} min={1} max={32} onChange={(rows) => patch({ rows }, "rows")} />
      <NumRow label="Columns" value={grid.cols} min={1} max={32} onChange={(cols) => patch({ cols }, "cols")} />
      <NumRow label="Gap" value={g.gap} min={0} max={100} unit="px" onChange={(gap) => set({ ...g, gap }, "gap")} />
      <ChoiceRow label="Fills along" value={grid.order} options={[{ value: "rows", label: "Rows" }, { value: "columns", label: "Columns" }]} onChange={(order) => patch({ order })} />
      <ChoiceRow label="Cell" value={grid.cell} options={[{ value: "square", label: "Square" }, { value: "rounded", label: "Rounded" }, { value: "circle", label: "Circle" }]} onChange={(cell) => patch({ cell })} />
      <PickRow
        label="Light cells"
        value={grid.lights ?? "order"}
        options={[{ value: "order", label: "In order" }, { value: "random", label: "Random" }, { value: "radial", label: "Middle out" }]}
        onChange={(lights) => {
          const { lights: _l, ...rest } = grid;
          set({ ...g, grid: lights === "order" ? rest : { ...rest, lights } });
        }}
      />
      <ToggleRow label="Cell border" value={!!grid.border} onChange={(on) => set({ ...g, grid: on ? { ...grid, border: CELL_BORDER } : plain })} />
      {grid.border && (
        <>
          <PaintRow label="Border colour" value={grid.border.color} onChange={(color) => patch({ border: { ...grid.border!, color } }, "border")} />
          <NumRow label="Border width" value={grid.border.width} min={0.5} max={16} step={0.5} unit="px" onChange={(width) => patch({ border: { ...grid.border!, width } }, "border-width")} />
        </>
      )}
    </>
  );
}

const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))} KB`;

function TemplateRows({ g, set }: InspectorProps) {
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const load = async (f: File) => {
    try {
      const got = importGauge(f.name, await f.text());
      set({ ...g, template: got.gauge.template, width: got.gauge.width, height: got.gauge.height });
      toast(got.removed.length ? `Loaded ${f.name}; removed ${got.removed.slice(0, 4).join(", ")}` : `Loaded ${f.name}`);
    } catch (e) {
      toast(`${f.name}: ${(e as Error).message}`);
    }
  };
  return (
    <div className="space-y-2 pt-1">
      <button
        type="button"
        onClick={() => file.current?.click()}
        className="flex h-[30px] w-full items-center justify-center rounded-[7px] border border-ui-default text-[12.5px] text-ui-1 hover:bg-ui-hover"
      >
        Replace SVG… ({kb(g.template?.length ?? 0)})
      </button>
      <input ref={file} type="file" accept=".svg,image/svg+xml" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void load(f); }} />
      <p className="text-[11.5px] leading-snug text-ui-4">
        Reads <code className="font-ui-mono">var(--value)</code> (0–1) and <code className="font-ui-mono">var(--percent)</code> (0–100) on the root element. CSS and SMIL animations keep running; scripts and outside links are removed. Up to 256 KB.
      </p>
    </div>
  );
}

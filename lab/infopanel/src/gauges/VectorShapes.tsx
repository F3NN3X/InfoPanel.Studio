/**
 * Form rows for the gauge creator's later parts (L13): the liquid and grid
 * shapes, arc rings, a bar's pattern and icon row, and the centre icon. A
 * part's checkbox adds it with defaults or removes it.
 */
import { binder, Num, PaintField, Row, Toggle } from "./form-kit.tsx";
import { BUBBLES, CELL_BORDER, DEFAULT_GRID, DEFAULT_ICON, DEFAULT_ICONS, DEFAULT_LIQUID, DEFAULT_PATTERN, DEFAULT_RINGS } from "@/lib/infopanel/gauges/shapes.ts";
import { GAUGE_ICONS, type CentreIcon, type GaugeIcon, type Grid, type IconRow, type Liquid, type Pattern, type Rings, type VectorGauge } from "@/lib/infopanel/gauges/vector.ts";

export interface ShapeExtrasProps {
  g: VectorGauge;
  onPreview(g: VectorGauge | null): void;
  onCommit(g: VectorGauge): void;
}

function without<K extends keyof VectorGauge>(g: VectorGauge, key: K): VectorGauge {
  const next = { ...g };
  delete next[key];
  return next;
}

function Choice<T extends string>({ value, options, onChange }: { value: T; options: readonly T[]; onChange(v: T): void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

export function ShapeExtras({ g, onPreview, onCommit }: ShapeExtrasProps) {
  const bind = binder(onPreview, onCommit);
  const set = (patch: Partial<VectorGauge>): VectorGauge => ({ ...g, ...patch });
  const toggle = <K extends keyof VectorGauge>(key: K, on: VectorGauge[K]) => () => onCommit(g[key] === undefined ? set({ [key]: on } as Partial<VectorGauge>) : without(g, key));
  const liquid = g.liquid ?? DEFAULT_LIQUID;
  const withLiquid = (patch: Partial<Liquid>) => set({ liquid: { ...liquid, ...patch } });
  const bubbles = liquid.bubbles;
  const grid = g.grid ?? DEFAULT_GRID;
  const withGrid = (patch: Partial<Grid>) => set({ grid: { ...grid, ...patch } });
  const rings = g.rings;
  const withRings = (patch: Partial<Rings>) => set({ rings: { ...rings!, ...patch } });
  const pattern = g.pattern;
  const withPattern = (patch: Partial<Pattern>) => set({ pattern: { ...pattern!, ...patch } });
  const icons = g.icons;
  const withIcons = (patch: Partial<IconRow>) => set({ icons: { ...icons!, ...patch } });
  const icon = g.icon;
  const withIcon = (patch: Partial<CentreIcon>) => set({ icon: { ...icon!, ...patch } });

  return (
    <>
      {g.shape === "liquid" && (
        <>
          <Row label="Container">
            <Choice value={liquid.container} options={["circle", "rect", "diamond", "hexagon"] as const} onChange={(container) => onCommit(withLiquid({ container }))} />{" "}
            {liquid.container === "rect" && (
              <>
                radius <Num {...bind(liquid.radius, (v) => withLiquid({ radius: v }))} min={0} max={1024} />{" "}
              </>
            )}
            inset <Num {...bind(liquid.inset, (v) => withLiquid({ inset: v }))} min={0} max={256} /> px <small>(the track fills it; Background adds a border)</small>
          </Row>
          <Row label="Wave">
            height <Num {...bind(liquid.amplitude, (v) => withLiquid({ amplitude: v }))} min={0} max={64} /> px, <Num {...bind(liquid.waves, (v) => withLiquid({ waves: v }))} min={0.5} max={8} step={0.5} /> across, one wave every{" "}
            <Num {...bind(liquid.speed, (v) => withLiquid({ speed: v }))} min={0} max={30} step={0.5} /> s <small>(0: still; baked frames are still)</small>
          </Row>
          <Row label="Bubbles">
            <Toggle on={!!bubbles} onChange={() => onCommit(bubbles ? withLiquid({ bubbles: undefined }) : withLiquid({ bubbles: BUBBLES }))} />
            {bubbles && (
              <>
                {" "}
                <Num {...bind(bubbles.count, (v) => withLiquid({ bubbles: { ...bubbles, count: v } }))} min={1} max={40} /> up to{" "}
                <Num {...bind(bubbles.size, (v) => withLiquid({ bubbles: { ...bubbles, size: v } }))} min={1} max={64} /> px, rising in about{" "}
                <Num {...bind(bubbles.speed, (v) => withLiquid({ bubbles: { ...bubbles, speed: v } }))} min={0} max={30} step={0.5} /> s <small>(0: still; baked frames show them still)</small>
              </>
            )}
          </Row>
          <Row label="Shine">
            <Toggle on={liquid.shine !== undefined} onChange={() => onCommit(withLiquid({ shine: liquid.shine === undefined ? 0.5 : undefined }))} />
            {liquid.shine !== undefined && (
              <>
                {" "}
                opacity <Num {...bind(liquid.shine, (v) => withLiquid({ shine: v }))} min={0} max={1} step={0.05} /> <small>(a highlight along the surface)</small>
              </>
            )}
          </Row>
        </>
      )}
      {g.shape === "grid" && (
        <Row label="Grid">
          <Num {...bind(grid.rows, (v) => withGrid({ rows: v }))} min={1} max={32} /> rows × <Num {...bind(grid.cols, (v) => withGrid({ cols: v }))} min={1} max={32} /> columns, fill along{" "}
          <Choice value={grid.order} options={["rows", "columns"] as const} onChange={(order) => onCommit(withGrid({ order }))} /> cells{" "}
          <Choice value={grid.cell} options={["square", "rounded", "circle"] as const} onChange={(cell) => onCommit(withGrid({ cell }))} /> gap{" "}
          <Num {...bind(g.gap, (v) => set({ gap: v }))} min={0} max={100} /> px
        </Row>
      )}
      {g.shape === "grid" && (
        <Row label="Cells">
          light{" "}
          <select value={grid.lights ?? ""} onChange={(e) => onCommit(withGrid({ lights: (e.target.value || undefined) as Grid["lights"] }))}>
            <option value="">in order</option>
            <option value="random">at random (the same every time)</option>
            <option value="radial">from the middle out</option>
          </select>{" "}
          <Toggle on={!!grid.border} label="border" onChange={() => onCommit(withGrid({ border: grid.border ? undefined : CELL_BORDER }))} />
          {grid.border && (
            <>
              {" "}
              <PaintField {...bind(grid.border.color, (v) => withGrid({ border: { ...grid.border!, color: v } }))} />{" "}
              <Num {...bind(grid.border.width, (v) => withGrid({ border: { ...grid.border!, width: v } }))} min={0.5} max={16} step={0.5} /> px
            </>
          )}
        </Row>
      )}
      {g.shape === "arc" && (
        <Row label="Rings">
          <Toggle on={!!rings} onChange={toggle("rings", DEFAULT_RINGS)} />
          {rings && (
            <>
              {" "}
              <Num {...bind(rings.count, (v) => withRings({ count: v }))} min={1} max={8} /> every <Num {...bind(rings.spacing, (v) => withRings({ spacing: v }))} min={1} max={64} /> px, width{" "}
              <Num {...bind(rings.width, (v) => withRings({ width: v }))} min={0.5} max={32} step={0.5} /> <PaintField {...bind(rings.color, (v) => withRings({ color: v }))} /> opacity{" "}
              <Num {...bind(rings.opacity, (v) => withRings({ opacity: v }))} min={0} max={1} step={0.05} /> <small>(decoration outside the arc, fading outwards)</small>
            </>
          )}
        </Row>
      )}
      {g.shape === "bar" && (
        <>
          <Row label="Icons">
            <Toggle on={!!icons} label="a row of icons instead of the bar" onChange={toggle("icons", DEFAULT_ICONS)} />
            {icons && (
              <>
                {" "}
                <Choice value={icons.name} options={GAUGE_ICONS} onChange={(name: GaugeIcon) => onCommit(withIcons({ name }))} /> ×{" "}
                <Num {...bind(icons.count, (v) => withIcons({ count: v }))} min={1} max={20} />{" "}
                <Toggle on={icons.progressive} label="the one at the value fills partly" onChange={() => onCommit(withIcons({ progressive: !icons.progressive }))} />
              </>
            )}
          </Row>
          {!icons && g.segments === 0 && (
            <Row label="Pattern">
              <Toggle on={!!pattern} onChange={toggle("pattern", DEFAULT_PATTERN)} />
              {pattern && (
                <>
                  {" "}
                  <Choice value={pattern.style} options={["stripes", "dots", "chevrons"] as const} onChange={(style) => onCommit(withPattern({ style }))} />{" "}
                  <PaintField {...bind(pattern.color, (v) => withPattern({ color: v }))} /> opacity{" "}
                  <Num {...bind(pattern.opacity, (v) => withPattern({ opacity: v }))} min={0} max={1} step={0.05} /> size <Num {...bind(pattern.size, (v) => withPattern({ size: v }))} min={4} max={256} /> px, moves a tile every{" "}
                  <Num {...bind(pattern.speed, (v) => withPattern({ speed: v }))} min={0} max={30} step={0.5} /> s <small>(0: still)</small>
                </>
              )}
            </Row>
          )}
        </>
      )}
      {g.shape !== "bar" && (
        <Row label="Centre icon">
          <Toggle on={!!icon} onChange={toggle("icon", DEFAULT_ICON)} />
          {icon && (
            <>
              {" "}
              <Choice value={icon.name} options={GAUGE_ICONS} onChange={(name: GaugeIcon) => onCommit(withIcon({ name }))} /> size{" "}
              <Num {...bind(icon.size, (v) => withIcon({ size: v }))} min={4} max={1024} /> <PaintField {...bind(icon.color, (v) => withIcon({ color: v }))} /> at{" "}
              <Num {...bind(Math.round(icon.y * 100), (v) => withIcon({ y: v / 100 }))} min={0} max={100} />% height <small>(the app's widget icons)</small>
            </>
          )}
        </Row>
      )}
    </>
  );
}

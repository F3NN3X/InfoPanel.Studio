/**
 * The vector gauge's optional parts as form rows (L10): minor ticks and
 * labels, scale, value text, background and effects. A part's checkbox adds
 * it with defaults or removes it, so older specs keep none of them.
 */
import { binder, Num, PaintField, Row, Text, Toggle } from "./form-kit.tsx";
import { DEFAULT_SCALE } from "./parts.ts";
import type { Background, Scale, Shadow, Ticks, ValueText, VectorGauge } from "./vector.ts";

export interface PartsRowsProps {
  g: VectorGauge;
  onPreview(g: VectorGauge | null): void;
  onCommit(g: VectorGauge): void;
}

const MINOR: NonNullable<Ticks["minor"]> = { count: 4, length: 4, width: 1, color: "muted" };
const LABELS: NonNullable<Ticks["labels"]> = { size: 12, color: "muted", font: "" };
const TEXT: ValueText = { size: 32, color: "fg", font: "", weight: 700, y: 0.5, format: "{value}{unit}" };
const BACKGROUND: Background = { color: "#0F172A", border: null, radius: 8 };
const SHADOW: Shadow = { blur: 6, dx: 0, dy: 2, color: "#000000", opacity: 0.5 };

/** Drops a key from the spec (an optional part turned off). */
function without<K extends keyof VectorGauge>(g: VectorGauge, key: K): VectorGauge {
  const next = { ...g };
  delete next[key];
  return next;
}

export function PartsRows({ g, onPreview, onCommit }: PartsRowsProps) {
  const bind = binder(onPreview, onCommit);
  const set = (patch: Partial<VectorGauge>): VectorGauge => ({ ...g, ...patch });
  const toggle = <K extends keyof VectorGauge>(key: K, on: VectorGauge[K]) => () => onCommit(g[key] === undefined ? set({ [key]: on } as Partial<VectorGauge>) : without(g, key));
  const scale: Scale = g.scale ?? DEFAULT_SCALE;
  const withScale = (patch: Partial<Scale>) => set({ scale: { ...scale, ...patch } });
  const text = g.text;
  const withText = (patch: Partial<ValueText>) => set({ text: { ...text!, ...patch } });
  const bg = g.background;
  const withBg = (patch: Partial<Background>) => set({ background: { ...bg!, ...patch } });
  const shadow = g.shadow;
  const withShadow = (patch: Partial<Shadow>) => set({ shadow: { ...shadow!, ...patch } });
  const ticks = g.ticks;
  const withTicks = (patch: Partial<Ticks>) => set({ ticks: { ...ticks!, ...patch } });
  const minor = ticks?.minor;
  const labels = ticks?.labels;
  const font = (value: string, update: (v: string) => VectorGauge) => <Text {...bind(value, update)} placeholder="default font" width={120} />;

  return (
    <>
      {ticks && (
        <>
          <Row label="Minor ticks">
            <Toggle on={!!minor} onChange={() => onCommit(withTicks({ minor: minor ? undefined : MINOR }))} />
            {minor && (
              <>
                {" "}
                <Num {...bind(minor.count, (v) => withTicks({ minor: { ...minor, count: v } }))} min={1} max={20} /> between majors, length{" "}
                <Num {...bind(minor.length, (v) => withTicks({ minor: { ...minor, length: v } }))} min={1} max={200} /> width{" "}
                <Num {...bind(minor.width, (v) => withTicks({ minor: { ...minor, width: v } }))} min={0.5} max={32} step={0.5} />{" "}
                <PaintField {...bind(minor.color, (v) => withTicks({ minor: { ...minor, color: v } }))} />
              </>
            )}
          </Row>
          <Row label="Tick labels">
            <Toggle on={!!labels} onChange={() => onCommit(withTicks({ labels: labels ? undefined : LABELS }))} />
            {labels && (
              <>
                {" "}
                size <Num {...bind(labels.size, (v) => withTicks({ labels: { ...labels, size: v } }))} min={4} max={200} />{" "}
                <PaintField {...bind(labels.color, (v) => withTicks({ labels: { ...labels, color: v } }))} />{" "}
                {font(labels.font, (v) => withTicks({ labels: { ...labels, font: v } }))} (the scale values at the major ticks)
              </>
            )}
          </Row>
        </>
      )}
      <Row label="Scale">
        <Num {...bind(scale.min, (v) => withScale({ min: v }))} min={-1e9} max={1e9} /> to <Num {...bind(scale.max, (v) => withScale({ max: v }))} min={-1e9} max={1e9} /> unit{" "}
        <Text {...bind(scale.unit, (v) => withScale({ unit: v.slice(0, 16) }))} width={64} /> decimals{" "}
        <select value={scale.decimals ?? ""} onChange={(e) => onCommit(withScale({ decimals: e.target.value === "" ? null : Number(e.target.value) }))}>
          <option value="">auto</option>
          {[0, 1, 2, 3, 4].map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>{" "}
        <small>for labels, value text and thresholds</small>
      </Row>
      <Row label="Value text">
        <Toggle on={!!text} onChange={toggle("text", TEXT)} />
        {text && (
          <>
            {" "}
            <Text {...bind(text.format, (v) => withText({ format: v.slice(0, 40) }))} width={120} /> size <Num {...bind(text.size, (v) => withText({ size: v }))} min={4} max={400} />{" "}
            <PaintField {...bind(text.color, (v) => withText({ color: v }))} /> {font(text.font, (v) => withText({ font: v }))} weight{" "}
            <Num {...bind(text.weight, (v) => withText({ weight: Math.round(v / 100) * 100 }))} min={100} max={900} step={100} /> at{" "}
            <Num {...bind(Math.round(text.y * 100), (v) => withText({ y: v / 100 }))} min={0} max={100} />% height <small>{"{value} and {unit} are replaced"}</small>
          </>
        )}
      </Row>
      <Row label="Background">
        <Toggle on={!!bg} onChange={toggle("background", BACKGROUND)} />
        {bg && (
          <>
            {" "}
            <Toggle on={bg.color !== null} label="fill" onChange={() => onCommit(withBg({ color: bg.color === null ? BACKGROUND.color : null }))} />{" "}
            {bg.color !== null && <PaintField {...bind(bg.color, (v) => withBg({ color: v }))} />}{" "}
            <Toggle on={!!bg.border} label="border" onChange={() => onCommit(withBg({ border: bg.border ? null : { color: "muted", width: 2 } }))} />{" "}
            {bg.border && (
              <>
                <PaintField {...bind(bg.border.color, (v) => withBg({ border: { ...bg.border!, color: v } }))} />{" "}
                <Num {...bind(bg.border.width, (v) => withBg({ border: { ...bg.border!, width: v } }))} min={0.5} max={64} step={0.5} /> px
              </>
            )}
            {g.shape === "bar" && (
              <>
                {" "}
                radius <Num {...bind(bg.radius, (v) => withBg({ radius: v }))} min={0} max={1024} />
              </>
            )}
          </>
        )}
      </Row>
      <Row label="Effects">
        glow <Num {...bind(g.glow ?? 0, (v) => (v > 0 ? set({ glow: v }) : without(g, "glow")))} min={0} max={64} /> px (around the fill){" "}
        <Toggle on={!!shadow} label="drop shadow" onChange={toggle("shadow", SHADOW)} />
        {shadow && (
          <>
            {" "}
            blur <Num {...bind(shadow.blur, (v) => withShadow({ blur: v }))} min={0} max={64} /> x <Num {...bind(shadow.dx, (v) => withShadow({ dx: v }))} min={-64} max={64} /> y{" "}
            <Num {...bind(shadow.dy, (v) => withShadow({ dy: v }))} min={-64} max={64} /> <PaintField {...bind(shadow.color, (v) => withShadow({ color: v }))} /> opacity{" "}
            <Num {...bind(shadow.opacity, (v) => withShadow({ opacity: v }))} min={0} max={1} step={0.05} />
          </>
        )}
      </Row>
    </>
  );
}

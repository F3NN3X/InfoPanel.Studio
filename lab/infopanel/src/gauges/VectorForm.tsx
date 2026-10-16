/**
 * The vector gauge spec as a form. Typing previews; a field commits when it
 * is left or Enter is pressed (selects and switches at once), so each change
 * is one undo step.
 */
import { useEffect, useState, type ReactNode } from "react";
import { sanitizeTemplate } from "./svg-template.ts";
import { DEFAULT_GAUGE, SAMPLE_TEMPLATE, type ColorStop, type FillMode, type VectorGauge } from "./vector.ts";

export interface VectorFormProps {
  gauge: VectorGauge;
  onPreview(g: VectorGauge | null): void;
  onCommit(g: VectorGauge): void;
}

/** A number field: local text, previewed while typing, committed on leave or Enter. */
function Num({ value, onPreview, onCommit, min, max, step = 1 }: {
  value: number;
  onPreview(v: number | null): void;
  onCommit(v: number): void;
  min: number;
  max: number;
  step?: number;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const parse = (t: string) => {
    const v = Number(t);
    return t.trim() !== "" && Number.isFinite(v) ? Math.min(Math.max(v, min), max) : null;
  };
  const commit = () => {
    const v = parse(text);
    onPreview(null);
    if (v === null) setText(String(value));
    else if (v !== value) onCommit(v);
  };
  return (
    <input
      type="number"
      value={text}
      min={min}
      max={max}
      step={step}
      style={{ width: 64 }}
      onChange={(e) => {
        setText(e.target.value);
        onPreview(parse(e.target.value));
      }}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
    />
  );
}

/** A colour field: previewed while the picker moves, committed when it closes (blur). */
function Color({ value, onPreview, onCommit }: { value: string; onPreview(v: string | null): void; onCommit(v: string): void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input
      type="color"
      value={v.toLowerCase()}
      onChange={(e) => {
        setV(e.target.value.toUpperCase());
        onPreview(e.target.value.toUpperCase());
      }}
      onBlur={() => {
        onPreview(null);
        if (v !== value) onCommit(v);
      }}
    />
  );
}

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <tr>
    <td>{label}</td>
    <td>{children}</td>
  </tr>
);

export function VectorForm({ gauge: g, onPreview, onCommit }: VectorFormProps) {
  // Field helpers: `with(patch)` is the spec with a change.
  const withPatch = (patch: Partial<VectorGauge>): VectorGauge => ({ ...g, ...patch });
  const num = (key: "width" | "height" | "start" | "sweep" | "thickness" | "segments" | "gap", min: number, max: number) => (
    <Num value={g[key]} min={min} max={max} onPreview={(v) => onPreview(v === null ? null : withPatch({ [key]: v }))} onCommit={(v) => onCommit(withPatch({ [key]: v }))} />
  );
  const setStops = (stops: ColorStop[]) => withPatch({ fill: { ...g.fill, stops } });
  const needle = g.needle ?? { color: "#F1F5F9", length: 0.85, width: 6 };
  const ticks = g.ticks ?? { count: 11, length: 8, width: 2, color: "#94A3B8" };

  return (
    <table>
      <tbody>
        <Row label="Shape">
          <select value={g.shape} onChange={(e) => onCommit(withShape(g, e.target.value as VectorGauge["shape"]))}>
            <option value="arc">arc</option>
            <option value="bar">bar</option>
            <option value="svg">SVG template</option>
          </select>{" "}
          {g.shape === "bar" && (
            <select value={g.orientation} onChange={(e) => onCommit(withPatch({ orientation: e.target.value as VectorGauge["orientation"] }))}>
              <option value="horizontal">horizontal</option>
              <option value="vertical">vertical</option>
            </select>
          )}{" "}
          <label>
            <input type="checkbox" checked={g.reverse} onChange={() => onCommit(withPatch({ reverse: !g.reverse }))} /> reverse
          </label>
        </Row>
        <Row label="Frame size">
          {num("width", 4, 2048)} × {num("height", 4, 2048)} px
        </Row>
        {g.shape === "svg" ? <TemplateRows gauge={g} onCommit={onCommit} /> : <ShapeRows {...{ g, num, withPatch, setStops, needle, ticks, onPreview, onCommit }} />}
      </tbody>
    </table>
  );
}

/** Leaving "svg" drops the template; choosing it starts from the sample. */
function withShape(g: VectorGauge, shape: VectorGauge["shape"]): VectorGauge {
  const { template, ...rest } = g;
  if (shape !== "svg") return { ...rest, shape };
  return template ? { ...g, shape } : { ...rest, shape, template: SAMPLE_TEMPLATE, width: 200, height: 200 };
}

function TemplateRows({ gauge: g, onCommit }: { gauge: VectorGauge; onCommit(g: VectorGauge): void }) {
  const [note, setNote] = useState<string | null>(null);
  const load = async (file: File) => {
    try {
      const t = sanitizeTemplate(await file.text());
      onCommit({ ...g, template: t.svg, width: t.width, height: t.height });
      const removed = [...new Set(t.removed)];
      setNote(removed.length ? `Loaded ${file.name}; removed: ${removed.slice(0, 8).join(", ")}${removed.length > 8 ? ", …" : ""}` : `Loaded ${file.name}`);
    } catch (e) {
      setNote(`${file.name}: ${(e as Error).message}`);
    }
  };
  return (
    <>
      <Row label="SVG file">
        <input type="file" accept=".svg,image/svg+xml" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />{" "}
        {kb(g.template?.length ?? 0)} {note && <em>{note}</em>}
      </Row>
      <Row label="Template">
        <small>
          Reads <code>var(--value)</code> (0–1) and <code>var(--percent)</code> (0–100, whole), set on the root element; default
          them in the file (<code>svg {"{ --value: 0.5 }"}</code>). Its CSS and SMIL animations keep running in the studio. Scripts,
          foreign content and links outside the file are removed. Baked frames for InfoPanel are still images at each value.
        </small>
      </Row>
    </>
  );
}

const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))} KB`;

interface ShapeRowsProps {
  g: VectorGauge;
  num(key: "width" | "height" | "start" | "sweep" | "thickness" | "segments" | "gap", min: number, max: number): ReactNode;
  withPatch(patch: Partial<VectorGauge>): VectorGauge;
  setStops(stops: ColorStop[]): VectorGauge;
  needle: NonNullable<VectorGauge["needle"]>;
  ticks: NonNullable<VectorGauge["ticks"]>;
  onPreview(g: VectorGauge | null): void;
  onCommit(g: VectorGauge): void;
}

/** The arc and bar fields. */
function ShapeRows({ g, num, withPatch, setStops, needle, ticks, onPreview, onCommit }: ShapeRowsProps) {
  return (
    <>
      {g.shape === "arc" && (
        <Row label="Arc">
          start {num("start", -360, 360)}° sweep {num("sweep", 1, 360)}° (0° is 12 o'clock, clockwise)
        </Row>
      )}
      <Row label="Thickness">
        {num("thickness", 1, 1024)} px{" "}
        <label>
          <input type="checkbox" checked={g.rounded} onChange={() => onCommit(withPatch({ rounded: !g.rounded }))} /> rounded
        </label>
      </Row>
      <Row label="Segments">
        {num("segments", 0, 200)} gap {num("gap", 0, 100)} {g.shape === "arc" ? "°" : "px"} (0 segments: continuous)
      </Row>
      <Row label="Track">
        <label>
          <input type="checkbox" checked={g.track !== null} onChange={() => onCommit(withPatch({ track: g.track === null ? DEFAULT_GAUGE.track : null }))} /> show
        </label>{" "}
        {g.track !== null && <Color value={g.track} onPreview={(v) => onPreview(v === null ? null : withPatch({ track: v }))} onCommit={(v) => onCommit(withPatch({ track: v }))} />}
      </Row>
      <Row label="Fill">
        <select value={g.fill.mode} onChange={(e) => onCommit(withPatch({ fill: { ...g.fill, mode: e.target.value as FillMode } }))}>
          <option value="solid">solid</option>
          <option value="gradient">gradient over the range</option>
          <option value="zones">colour zones</option>
        </select>{" "}
        {g.fill.mode === "solid" ? (
          <Color value={g.fill.color} onPreview={(v) => onPreview(v === null ? null : withPatch({ fill: { ...g.fill, color: v } }))} onCommit={(v) => onCommit(withPatch({ fill: { ...g.fill, color: v } }))} />
        ) : (
          <span>
            {g.fill.stops.map((s, i) => (
              <span key={i} style={{ whiteSpace: "nowrap", marginRight: 8 }}>
                {g.fill.mode === "zones" ? "from " : "at "}
                <Num
                  value={s.at}
                  min={0}
                  max={100}
                  onPreview={(v) => onPreview(v === null ? null : setStops(g.fill.stops.map((t, k) => (k === i ? { ...t, at: v } : t))))}
                  onCommit={(v) => onCommit(setStops(g.fill.stops.map((t, k) => (k === i ? { ...t, at: v } : t))))}
                />
                %{" "}
                <Color
                  value={s.color}
                  onPreview={(v) => onPreview(v === null ? null : setStops(g.fill.stops.map((t, k) => (k === i ? { ...t, color: v } : t))))}
                  onCommit={(v) => onCommit(setStops(g.fill.stops.map((t, k) => (k === i ? { ...t, color: v } : t))))}
                />
                {g.fill.stops.length > 1 && (
                  <button title="Remove this stop" onClick={() => onCommit(setStops(g.fill.stops.filter((_, k) => k !== i)))}>
                    ✕
                  </button>
                )}
              </span>
            ))}
            {g.fill.stops.length < 16 && <button onClick={() => onCommit(setStops([...g.fill.stops, { at: 100, color: "#FFFFFF" }]))}>Add stop</button>}
          </span>
        )}
      </Row>
      <Row label={g.shape === "arc" ? "Needle" : "Marker"}>
        <label>
          <input type="checkbox" checked={g.needle !== null} onChange={() => onCommit(withPatch({ needle: g.needle ? null : needle }))} /> show
        </label>
        {g.needle && (
          <>
            {" "}
            <Color value={needle.color} onPreview={(v) => onPreview(v === null ? null : withPatch({ needle: { ...needle, color: v } }))} onCommit={(v) => onCommit(withPatch({ needle: { ...needle, color: v } }))} /> length{" "}
            <Num value={needle.length} min={0.1} max={g.shape === "arc" ? 1.2 : 2} step={0.05} onPreview={(v) => onPreview(v === null ? null : withPatch({ needle: { ...needle, length: v } }))} onCommit={(v) => onCommit(withPatch({ needle: { ...needle, length: v } }))} /> width{" "}
            <Num value={needle.width} min={1} max={64} onPreview={(v) => onPreview(v === null ? null : withPatch({ needle: { ...needle, width: v } }))} onCommit={(v) => onCommit(withPatch({ needle: { ...needle, width: v } }))} />
          </>
        )}
      </Row>
      <Row label="Ticks">
        <label>
          <input type="checkbox" checked={g.ticks !== null} onChange={() => onCommit(withPatch({ ticks: g.ticks ? null : ticks }))} /> show
        </label>
        {g.ticks && (
          <>
            {" "}
            <Num value={ticks.count} min={2} max={200} onPreview={(v) => onPreview(v === null ? null : withPatch({ ticks: { ...ticks, count: v } }))} onCommit={(v) => onCommit(withPatch({ ticks: { ...ticks, count: v } }))} /> ticks, length{" "}
            <Num value={ticks.length} min={1} max={200} onPreview={(v) => onPreview(v === null ? null : withPatch({ ticks: { ...ticks, length: v } }))} onCommit={(v) => onCommit(withPatch({ ticks: { ...ticks, length: v } }))} /> width{" "}
            <Num value={ticks.width} min={0.5} max={32} step={0.5} onPreview={(v) => onPreview(v === null ? null : withPatch({ ticks: { ...ticks, width: v } }))} onCommit={(v) => onCommit(withPatch({ ticks: { ...ticks, width: v } }))} />{" "}
            <Color value={ticks.color} onPreview={(v) => onPreview(v === null ? null : withPatch({ ticks: { ...ticks, color: v } }))} onCommit={(v) => onCommit(withPatch({ ticks: { ...ticks, color: v } }))} />
          </>
        )}
      </Row>
    </>
  );
}

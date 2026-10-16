/**
 * The vector gauge spec as a form: shape, track and fill here, the optional
 * parts (scale, value text, labels, background, effects) in VectorParts.
 * Each committed change is one undo step.
 */
import { useState } from "react";
import { binder, Color, Num, PaintField, Row, Toggle } from "./form-kit.tsx";
import { SAMPLE_TEMPLATE } from "./presets.ts";
import { sanitizeTemplate } from "./svg-template.ts";
import { DEFAULT_GAUGE, type ColorStop, type FillMode, type NeedleStyle, type VectorGauge } from "./vector.ts";
import { PartsRows } from "./VectorParts.tsx";

export interface VectorFormProps {
  gauge: VectorGauge;
  onPreview(g: VectorGauge | null): void;
  onCommit(g: VectorGauge): void;
}

export function VectorForm({ gauge: g, onPreview, onCommit }: VectorFormProps) {
  const bind = binder(onPreview, onCommit);
  const set = (patch: Partial<VectorGauge>): VectorGauge => ({ ...g, ...patch });
  const size = (key: "width" | "height") => <Num {...bind(g[key], (v) => set({ [key]: v }))} min={4} max={2048} />;
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
            <select value={g.orientation} onChange={(e) => onCommit(set({ orientation: e.target.value as VectorGauge["orientation"] }))}>
              <option value="horizontal">horizontal</option>
              <option value="vertical">vertical</option>
            </select>
          )}{" "}
          <Toggle on={g.reverse} label="reverse" onChange={() => onCommit(set({ reverse: !g.reverse }))} />
        </Row>
        <Row label="Frame size">
          {size("width")} × {size("height")} px
        </Row>
        {g.shape === "svg" ? (
          <TemplateRows gauge={g} onCommit={onCommit} />
        ) : (
          <>
            <ShapeRows g={g} onPreview={onPreview} onCommit={onCommit} />
            <PartsRows g={g} onPreview={onPreview} onCommit={onCommit} />
          </>
        )}
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

const NEEDLE_STYLES: { value: NeedleStyle; label: string }[] = [
  { value: "taper", label: "taper" },
  { value: "line", label: "line" },
  { value: "arrow", label: "arrow" },
  { value: "blade", label: "blade" },
];

/** The arc and bar fields: geometry, track, fill, needle and major ticks. */
function ShapeRows({ g, onPreview, onCommit }: { g: VectorGauge; onPreview(g: VectorGauge | null): void; onCommit(g: VectorGauge): void }) {
  const bind = binder(onPreview, onCommit);
  const set = (patch: Partial<VectorGauge>): VectorGauge => ({ ...g, ...patch });
  const num = (key: "start" | "sweep" | "thickness" | "segments" | "gap", min: number, max: number) => <Num {...bind(g[key], (v) => set({ [key]: v }))} min={min} max={max} />;
  const fill = (patch: Partial<VectorGauge["fill"]>) => set({ fill: { ...g.fill, ...patch } });
  const setStop = (i: number, patch: Partial<ColorStop>) => fill({ stops: g.fill.stops.map((s, k) => (k === i ? { ...s, ...patch } : s)) });
  const needle = g.needle ?? { color: "#F1F5F9", length: 0.85, width: 6 };
  const ticks = g.ticks ?? { count: 11, length: 8, width: 2, color: "#94A3B8" };
  const withNeedle = (patch: Partial<typeof needle>) => set({ needle: { ...needle, ...patch } });
  const withTicks = (patch: Partial<typeof ticks>) => set({ ticks: { ...ticks, ...patch } });

  return (
    <>
      {g.shape === "arc" && (
        <Row label="Arc">
          start {num("start", -360, 360)}° sweep {num("sweep", 1, 360)}° (0° is 12 o'clock, clockwise)
        </Row>
      )}
      <Row label="Thickness">
        {num("thickness", 1, 1024)} px <Toggle on={g.rounded} label="rounded" onChange={() => onCommit(set({ rounded: !g.rounded }))} />
      </Row>
      <Row label="Segments">
        {num("segments", 0, 200)} gap {num("gap", 0, 100)} {g.shape === "arc" ? "°" : "px"} (0 segments: continuous)
      </Row>
      <Row label="Track">
        <Toggle on={g.track !== null} onChange={() => onCommit(set({ track: g.track === null ? DEFAULT_GAUGE.track : null }))} />{" "}
        {g.track !== null && (
          <>
            <PaintField {...bind(g.track, (v) => set({ track: v }))} /> opacity{" "}
            <Num {...bind(g.trackOpacity ?? 1, (v) => set({ trackOpacity: v }))} min={0} max={1} step={0.05} />
          </>
        )}
      </Row>
      <Row label="Fill">
        <select
          value={g.fill.mode}
          onChange={(e) => {
            const mode = e.target.value as FillMode;
            // Thresholds start at the values the fields show.
            onCommit(fill({ mode, ...(mode === "thresholds" ? { warn: g.fill.warn ?? 70, crit: g.fill.crit ?? 90 } : {}) }));
          }}
        >
          <option value="solid">solid</option>
          <option value="thresholds">thresholds (ok / warning / critical)</option>
          <option value="gradient">gradient over the range</option>
          <option value="zones">colour zones</option>
        </select>{" "}
        {g.fill.mode === "solid" || g.fill.mode === "thresholds" ? (
          <>
            <PaintField {...bind(g.fill.color, (v) => fill({ color: v }))} />
            {g.fill.mode === "thresholds" && (
              <>
                {" "}
                warning from <Num {...bind(g.fill.warn ?? 70, (v) => fill({ warn: v }))} min={-1e9} max={1e9} /> critical from{" "}
                <Num {...bind(g.fill.crit ?? 90, (v) => fill({ crit: v }))} min={-1e9} max={1e9} /> (scale values)
              </>
            )}
          </>
        ) : (
          <span>
            {g.fill.stops.map((s, i) => (
              <span key={i} style={{ whiteSpace: "nowrap", marginRight: 8 }}>
                {g.fill.mode === "zones" ? "from " : "at "}
                <Num {...bind(s.at, (v) => setStop(i, { at: v }))} min={0} max={100} />% <Color {...bind(s.color, (v) => setStop(i, { color: v }))} />
                {g.fill.stops.length > 1 && (
                  <button title="Remove this stop" onClick={() => onCommit(fill({ stops: g.fill.stops.filter((_, k) => k !== i) }))}>
                    ✕
                  </button>
                )}
              </span>
            ))}
            {g.fill.stops.length < 16 && <button onClick={() => onCommit(fill({ stops: [...g.fill.stops, { at: 100, color: "#FFFFFF" }] }))}>Add stop</button>}
          </span>
        )}
      </Row>
      <Row label={g.shape === "arc" ? "Needle" : "Marker"}>
        <Toggle on={g.needle !== null} onChange={() => onCommit(set({ needle: g.needle ? null : needle }))} />
        {g.needle && (
          <>
            {" "}
            {g.shape === "arc" && (
              <select value={needle.style ?? "taper"} onChange={(e) => onCommit(withNeedle({ style: e.target.value as NeedleStyle }))}>
                {NEEDLE_STYLES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            )}{" "}
            <PaintField {...bind(needle.color, (v) => withNeedle({ color: v }))} /> length{" "}
            <Num {...bind(needle.length, (v) => withNeedle({ length: v }))} min={0.1} max={g.shape === "arc" ? 1.2 : 2} step={0.05} /> width{" "}
            <Num {...bind(needle.width, (v) => withNeedle({ width: v }))} min={1} max={64} />
          </>
        )}
      </Row>
      <Row label="Ticks">
        <Toggle on={g.ticks !== null} onChange={() => onCommit(set({ ticks: g.ticks ? null : ticks }))} />
        {g.ticks && (
          <>
            {" "}
            <Num {...bind(ticks.count, (v) => withTicks({ count: v }))} min={2} max={200} /> major, length <Num {...bind(ticks.length, (v) => withTicks({ length: v }))} min={1} max={200} /> width{" "}
            <Num {...bind(ticks.width, (v) => withTicks({ width: v }))} min={0.5} max={32} step={0.5} /> <PaintField {...bind(ticks.color, (v) => withTicks({ color: v }))} />
          </>
        )}
      </Row>
    </>
  );
}

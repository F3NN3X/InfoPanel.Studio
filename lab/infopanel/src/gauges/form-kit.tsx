/**
 * Fields for the vector gauge form. Typing previews; a field commits when it
 * is left or Enter is pressed (selects and switches at once), so each change
 * is one undo step.
 */
import { useEffect, useState, type ReactNode } from "react";
import { isThemeColor, THEME, type Paint, type VectorGauge } from "@/lib/infopanel/gauges/vector.ts";

export interface FieldProps<T> {
  value: T;
  onPreview(v: T | null): void;
  onCommit(v: T): void;
}

/** Binds a field to the spec: `update` makes the spec with the field's new value. */
export const binder =
  (onPreview: (g: VectorGauge | null) => void, onCommit: (g: VectorGauge) => void) =>
  <T,>(value: T, update: (v: T) => VectorGauge): FieldProps<T> => ({
    value,
    onPreview: (v) => onPreview(v === null ? null : update(v)),
    onCommit: (v) => onCommit(update(v)),
  });

/** A number field: local text, previewed while typing, committed on leave or Enter. */
export function Num({ value, onPreview, onCommit, min, max, step = 1 }: FieldProps<number> & { min: number; max: number; step?: number }) {
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

/** A text field, committed on leave or Enter. */
export function Text({ value, onPreview, onCommit, width = 96, placeholder }: FieldProps<string> & { width?: number; placeholder?: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => {
    onPreview(null);
    if (text !== value) onCommit(text);
  };
  return (
    <input
      value={text}
      placeholder={placeholder}
      style={{ width }}
      onChange={(e) => {
        setText(e.target.value);
        onPreview(e.target.value);
      }}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
    />
  );
}

/** A colour picker for #RRGGBB: previewed while it moves, committed when it closes (blur). */
export function Color({ value, onPreview, onCommit }: FieldProps<string>) {
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

const HEX = /^#[0-9a-f]{6}$/i;

/** A theme colour (follows the dashboard theme) or a custom one. */
export function PaintField(props: FieldProps<Paint>) {
  const { value, onCommit } = props;
  const theme = isThemeColor(value);
  return (
    <span style={{ whiteSpace: "nowrap" }}>
      <select
        value={theme ? value : ""}
        title="Theme colours follow the dashboard theme; a custom colour stays fixed"
        onChange={(e) => {
          const next = e.target.value;
          // Custom starts from the theme colour's default where it is a plain colour.
          onCommit(next || (theme && HEX.test(THEME[value].hex) ? THEME[value].hex : "#FFFFFF"));
        }}
      >
        <option value="">custom</option>
        {Object.entries(THEME).map(([k, t]) => (
          <option key={k} value={k}>
            {t.label}
          </option>
        ))}
      </select>
      {!theme && <Color {...props} />}
    </span>
  );
}

/** A checkbox that turns an optional part on (with its defaults) or off. */
export function Toggle({ on, label = "show", onChange }: { on: boolean; label?: string; onChange(): void }) {
  return (
    <label>
      <input type="checkbox" checked={on} onChange={onChange} /> {label}
    </label>
  );
}

export const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <tr>
    <td>{label}</td>
    <td>{children}</td>
  </tr>
);

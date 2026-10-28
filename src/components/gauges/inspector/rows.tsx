/**
 * The part inspectors' rows, on the studio's setting rows: a number (slider with its box, or a plain
 * box when unbounded), a colour that is fixed or follows the dashboard theme, and a stack of choices.
 * Every change is `set(next, key)`: the key coalesces a drag into one undo step.
 */
import { SegmentedRow, SelectRow, SliderRow, TextRow, ToggleRow, InlineRow } from "@/components/studio/setting-rows";
import { customOf, follows, followOf, THEME_COLORS } from "@/lib/gauge-studio/paint";
import { THEME, type Paint, type VectorGauge } from "@/lib/infopanel/gauges/vector";

export interface InspectorProps {
  g: VectorGauge;
  set: (next: VectorGauge, key?: string) => void;
}

export { SegmentedRow, SelectRow, TextRow, ToggleRow };

export function NumRow(p: { label: string; value: number; min?: number; max?: number; step?: number; unit?: string; onChange: (v: number) => void }) {
  return <SliderRow {...p} fallback={p.value} />;
}

/** A colour: a theme colour (follows the dashboard theme) or a fixed one. `fixedOnly` for fill stops. */
export function PaintRow({ label, value, onChange, fixedOnly }: { label: string; value: Paint; onChange: (v: Paint) => void; fixedOnly?: boolean }) {
  const theme = follows(value);
  return (
    <InlineRow label={label}>
      {!fixedOnly && (
        <select
          aria-label={`${label} source`}
          value={theme ? value : "custom"}
          onChange={(e) => onChange(e.target.value === "custom" ? customOf(value) : followOf(e.target.value))}
          className="h-7 max-w-[120px] cursor-pointer rounded-md border border-ui-strong bg-ui-hover px-1.5 text-[12px] text-ui-1 outline-none focus:border-ui-accent"
        >
          {THEME_COLORS.map((c) => (
            <option key={c} value={c}>
              {THEME[c].label}
            </option>
          ))}
          <option value="custom">Custom color</option>
        </select>
      )}
      {!theme && <ColorInput label={label} value={value} onChange={onChange} />}
    </InlineRow>
  );
}

export function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="color"
      aria-label={`${label}: color`}
      value={value.toLowerCase()}
      onChange={(e) => onChange(e.currentTarget.value.toUpperCase())}
      className="h-7 w-9 shrink-0 cursor-pointer rounded-md border border-ui-strong bg-ui-hover p-0.5"
    />
  );
}

/** A percentage of the height, stored as 0..1. */
export function HeightRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return <NumRow label={label} value={Math.round(value * 100)} min={0} max={100} unit="%" onChange={(v) => onChange(v / 100)} />;
}

/** A segmented choice from a plain list of values. */
export function ChoiceRow<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void }) {
  return <SegmentedRow label={label} value={value} options={[...options]} onChange={(v) => onChange(v as T)} />;
}

/** A select from a plain list of values. */
export function PickRow<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void }) {
  return <SelectRow label={label} value={value} options={[...options]} onChange={(v) => onChange(v as T)} />;
}

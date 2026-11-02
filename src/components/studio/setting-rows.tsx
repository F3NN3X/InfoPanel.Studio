import { useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import { Popover } from "@/components/ui/popover";
import { Segmented } from "@/components/ui/segmented";
import { Toggle } from "@/components/ui/toggle";
import { ensureAllFonts, fontById } from "@/lib/fonts";
import { cn } from "@/lib/utils";
import { ColorButton, ColorSwatches } from "./inspector/color-swatches";
import { ValueBox } from "./inspector/value-box";
import { useInInspector, useInspectorChrome } from "./inspector-layout";

/**
 * The inspector's field rows: `[lead] [label ……] [control] [trail]`, one
 * column. Small controls sit on the label's line (toggle, select, colour, a
 * slider with its value, a short segmented set); the rest go under it at full
 * width (a longer segmented set on one scrolling line, text, code, grids).
 * `lead` is the source dot, `trail` the quick-bar pin. Rows are 30 px high,
 * 44 in the phone sheet.
 */

export const FIELD =
  "rounded-md border border-ui-control bg-ui-app px-[9px] text-[12.5px] text-ui-1 outline-none placeholder:text-ui-4 focus:border-ui-accent";

/** A select: h28, #1a1a1f, up to 170 wide. */
export const SELECT =
  "h-7 max-w-[170px] cursor-pointer whitespace-nowrap rounded-md border border-ui-control bg-ui-hover px-1.5 text-caption text-ui-1 outline-none focus:border-ui-accent";

export interface RowLabelProps {
  label: string;
  /** Before the label (the source dot). */
  lead?: ReactNode;
  /** After the control, at the line's end (the quick-bar pin). */
  trail?: ReactNode;
  /** One-line explanation behind an info icon. */
  hint?: string;
  /** The value is set here: the label reads brighter. */
  changed?: boolean;
}

/** The label of a row (truncated to one line, full text on hover). */
function Label({ label, lead, hint, changed, className }: RowLabelProps & { className?: string }) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      {lead}
      <span title={label} className={cn("min-w-0 truncate text-[12.5px]", changed ? "text-ui-1" : "text-ui-2")}>
        {label}
      </span>
      {hint && (
        <Popover
          trigger={<Info className="h-3.5 w-3.5" aria-hidden="true" />}
          triggerLabel={`About ${label}`}
          triggerClassName="relative shrink-0 cursor-help rounded-sm text-ui-hint hover:text-ui-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent after:absolute after:-inset-1.5 after:content-['']"
          align="start"
          className="max-w-64 text-pretty text-caption leading-snug"
        >
          {hint}
        </Popover>
      )}
    </span>
  );
}

/** The label's line: 30 px high (44 in the phone sheet). */
function useRowHeight() {
  return useInspectorChrome().mode === "sheet" ? "min-h-11" : "min-h-[30px]";
}

/** Label over a full-width control (segmented, text, lists, pickers); the trail stays on the label's line. */
export function StackRow({ children, trail, ...label }: RowLabelProps & { children: ReactNode }) {
  const height = useRowHeight();
  return (
    <div className="space-y-1.5">
      <div className={cn("flex items-center gap-2", height)}>
        <Label {...label} className="flex-1" />
        {trail}
      </div>
      {children}
    </div>
  );
}

/** Label left, control right, one line. */
export function InlineRow({ children, trail, ...label }: RowLabelProps & { children: ReactNode }) {
  const height = useRowHeight();
  return (
    <div className={cn("flex items-center gap-2", height)}>
      <Label {...label} className="flex-1" />
      {children}
      {trail}
    </div>
  );
}

export function ToggleRow({
  value,
  onChange,
  ...label
}: RowLabelProps & { value: boolean; onChange: (value: boolean) => void }) {
  return (
    <InlineRow {...label}>
      <Toggle checked={value} onChange={onChange} label={label.label} className="[&>span]:bg-ui-1" />
    </InlineRow>
  );
}

/**
 * A number: in the inspector a bounded one is a 90 px slider and its value
 * box on the label's line (in the narrower left panels the slider goes under
 * the label at full width); an unbounded one is just the value box.
 */
export function SliderRow({
  value,
  min,
  max,
  step = 1,
  unit,
  fallback,
  onChange,
  ...label
}: RowLabelProps & {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  /** "%", "px" or "rem": shown in the value box. */
  unit?: string;
  /** Used when the input is cleared. */
  fallback: number;
  onChange: (value: number) => void;
}) {
  const inline = useInInspector();
  if (min !== undefined && max !== undefined) {
    const range = (
      <input
        type="range"
        aria-label={label.label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(e.currentTarget.valueAsNumber)}
        className={cn("m-0 block h-4 cursor-pointer accent-[var(--ui-accent)]", inline ? "w-[90px] shrink-0" : "w-full")}
      />
    );
    const box = (
      <ValueBox value={value} min={min} max={max} step={step} unit={unit} label={label.label} onChange={onChange} compact={inline} />
    );
    if (!inline)
      return (
        <div className="space-y-2">
          <InlineRow {...label}>{box}</InlineRow>
          {range}
        </div>
      );
    return (
      <InlineRow {...label}>
        <span className="flex shrink-0 items-center gap-2">
          {range}
          {box}
        </span>
      </InlineRow>
    );
  }
  return (
    <InlineRow {...label}>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label.label}
        onChange={(e) => onChange(e.target.value === "" ? fallback : Number(e.target.value))}
        className={cn(FIELD, "h-[26px] w-[64px] shrink-0 px-1.5 text-right font-ui-mono text-[11.5px]")}
      />
    </InlineRow>
  );
}

const SEGMENT_BUTTONS =
  "gap-0.5 rounded-[7px] [&>button]:whitespace-nowrap [&>button]:text-[11.5px] [&>button]:font-medium [&>button:not([aria-checked=true])]:text-ui-4";

/**
 * A segmented control at full width: one line that scrolls sideways if it
 * must, buttons sharing the width. Never truncated, never wrapped.
 */
export const SEGMENTED_CLASS = cn(
  SEGMENT_BUTTONS,
  "w-full flex-nowrap overflow-x-auto [scrollbar-width:none] [&>button]:flex-[1_1_auto] [&>button]:px-1.5 [&>button]:py-[5px]"
);
/** A short segmented set beside its label. */
const SEGMENTED_INLINE = cn(SEGMENT_BUTTONS, "shrink-0 flex-nowrap [&>button]:px-2 [&>button]:py-1");

/** Longest option label that still sits beside the field's label. */
const INLINE_LABEL = 11;

/** A segmented set sits inline when it is short: at most three options of at most eleven characters. */
export const segmentedInline = (labels: readonly string[]): boolean =>
  labels.length <= 3 && labels.every((l) => l.length <= INLINE_LABEL);

export function SegmentedRow({
  options,
  value,
  onChange,
  ...label
}: RowLabelProps & {
  options: { value: string; label: string; title?: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  const control = (inline: boolean) => (
    <Segmented
      options={options}
      value={value}
      onChange={onChange}
      label={label.label}
      className={inline ? SEGMENTED_INLINE : SEGMENTED_CLASS}
    />
  );
  if (segmentedInline(options.map((o) => o.label))) return <InlineRow {...label}>{control(true)}</InlineRow>;
  return <StackRow {...label}>{control(false)}</StackRow>;
}

export function SelectRow({
  options,
  value,
  onChange,
  previewFonts,
  ...label
}: RowLabelProps & {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  /** A font list: each catalog font's option is drawn in that font (the fonts load when the list is first used). */
  previewFonts?: boolean;
}) {
  return (
    <InlineRow {...label}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={previewFonts ? () => ensureAllFonts() : undefined}
        aria-label={label.label}
        className={cn(SELECT, "min-w-0 shrink")}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} style={previewFonts ? { fontFamily: fontById(o.value)?.stack } : undefined}>
            {o.label}
          </option>
        ))}
      </select>
    </InlineRow>
  );
}

/**
 * A colour: the button on the label's line shows "Auto", the swatch's name or
 * the hex; clicking it opens a row of swatches under the field (Auto, the six
 * accent hues, White, then the custom picker). "" means Auto.
 */
export function ColorRow({
  value,
  name,
  onChange,
  onReset,
  ...label
}: RowLabelProps & {
  value: string;
  /** What the button calls the value instead of its colour name (a palette role followed: "Series 1"). */
  name?: string;
  onChange: (value: string) => void;
  /** Back to Auto, for rows without a source dot. */
  onReset?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-1.5">
      <InlineRow {...label}>
        <ColorButton value={value} name={name} open={open} label={label.label} onClick={() => setOpen((o) => !o)} />
      </InlineRow>
      {open && <ColorSwatches value={value} label={label.label} onChange={(v) => (v === "" && onReset ? onReset() : onChange(v))} />}
    </div>
  );
}

export function TextRow({
  value,
  multiline,
  placeholder,
  onChange,
  kind = "text",
  ...label
}: RowLabelProps & {
  value: string;
  /** The input's type: a native date or time picker. */
  kind?: "text" | "date" | "time";
  /** A code area (mono, 96 high): custom CSS. */
  multiline?: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <StackRow {...label}>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          aria-label={label.label}
          placeholder={placeholder ?? ":scope { border-radius: 0 }"}
          className={cn(FIELD, "block h-24 w-full resize-y py-2 font-ui-mono text-[11.5px] leading-relaxed")}
        />
      ) : (
        <input
          type={kind}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label.label}
          placeholder={placeholder}
          className={cn(FIELD, "h-[30px] w-full", kind !== "text" && "[color-scheme:dark]")}
        />
      )}
    </StackRow>
  );
}

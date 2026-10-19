import type { WidgetKind } from "@/lib/panel-model";
import { TextRow } from "../setting-rows";
import { ColorInput, Field, InlineField, NumberInput, TextInput } from "./fields";
import type { WidgetSectionProps } from "./types";

/** Kinds that read `fontSize` (a gauge's ring diameter). */
const SIZED: ReadonlySet<WidgetKind> = new Set(["stat", "value", "gauge", "customGauge", "table", "text", "clock"]);

/** Kinds that read `color`. */
const COLORED: ReadonlySet<WidgetKind> = new Set([
  "stat",
  "value",
  "bar",
  "gauge",
  "sparkline",
  "text",
  "clock",
  "shape",
]);

/** The class / data hooks a widget's CSS can target (see `WidgetCell`). */
const HOOKS = [
  [":scope", "this widget's cell"],
  [".wp-label", "label"],
  [".wp-value", "value"],
  [".wp-unit", "unit"],
  [".wp-bar-fill", "bar fill"],
] as const;

/** Whether the kind reads `fontSize`. */
export const hasTypography = (widget: WidgetSectionProps["widget"]) => SIZED.has(widget.kind);

/** Whether the kind reads `color`. */
export const hasColor = (widget: WidgetSectionProps["widget"]) => COLORED.has(widget.kind);

/** Font size (a gauge's ring size). */
export function TypographyFields({ widget, set }: WidgetSectionProps) {
  return (
    <InlineField label={widget.kind === "gauge" ? "Ring size (px)" : widget.kind === "customGauge" ? "Width (px)" : "Font size (px)"}>
      <NumberInput
        value={widget.fontSize}
        min={8}
        max={200}
        optional
        fallback={8}
        placeholder={widget.kind === "customGauge" ? "120" : "auto"}
        onChange={(v) => set("fontSize", v)}
      />
    </InlineField>
  );
}

/** The widget's color override. */
export function ColorFields({ widget, set, enforce }: WidgetSectionProps) {
  return (
    <>
      <ColorInput label="Color" value={widget.color} onChange={(v) => set("color", v)} />
      {enforce && (
        <p className="text-[11.5px] leading-snug text-ui-warning">
          Force global style is on — this widget's own look values are ignored.
        </p>
      )}
    </>
  );
}

/** Extra class names and the widget's own CSS, with the hooks it can target. */
export function AdvancedFields({ widget, set }: WidgetSectionProps) {
  return (
    <>
      <Field label="Class names" hint="hooks for panel CSS">
        <TextInput value={widget.className} placeholder="big accent" mono onChange={(v) => set("className", v)} />
      </Field>
      <TextRow
        label="Custom CSS"
        hint="scoped to this widget's cell"
        multiline
        value={widget.css ?? ""}
        placeholder=":scope .wp-value { color: tomato }"
        onChange={(v) => set("css", v || undefined)}
      />
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 text-[10.5px] text-ui-4">
        {HOOKS.map(([hook, what]) => (
          <div key={hook} className="contents">
            <dt className="font-ui-mono">{hook}</dt>
            <dd>{what}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

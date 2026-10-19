import { Segmented } from "@/components/ui/segmented";
import type { Widget, WidgetKind } from "@/lib/panel-model";
import { SEGMENTED_CLASS } from "../setting-rows";
import { STARTERS } from "@/lib/infopanel/gauges/presets";
import { normalizeGauge } from "@/lib/infopanel/gauges/vector";
import { DEFAULT_GAUGE_SPEC } from "@/widgets/CustomGauge";
import { Field, INPUT, InlineField, NumberInput, Switch, TextInput } from "./fields";
import type { WidgetSectionProps } from "./types";

/** Kinds whose text lines up left / center / right. */
const ALIGNABLE: ReadonlySet<WidgetKind> = new Set(["stat", "value", "table", "text", "clock"]);

/** Kinds with fields of their own (the Kind card): display options, static text, the fill's maximum. */
const HAS_KIND_FIELDS: ReadonlySet<WidgetKind> = new Set([...ALIGNABLE, "image", "shape", "sparkline", "bar", "gauge", "customGauge"]);

/** Whether the widget's kind has fields of its own. */
export const hasKindFields = (widget: WidgetSectionProps["widget"]) => HAS_KIND_FIELDS.has(widget.kind);

/** The kind-specific fields (shape, rows, clock layout, fill maximum, …): the Kind card's body. */
export function KindFields({ widget, set }: WidgetSectionProps) {
  return (
    <>
      {widget.kind === "shape" && (
        <>
          <Field label="Shape">
            <Segmented
              options={[
                { value: "vbar", label: "V-bar" },
                { value: "hbar", label: "H-bar" },
                { value: "rect", label: "Rect" },
                { value: "circle", label: "Circle" },
              ]}
              value={widget.shape ?? "vbar"}
              onChange={(v) => set("shape", v as Widget["shape"])}
              className={SEGMENTED_CLASS}
            />
          </Field>
          <InlineField label="Thickness / diameter (px)">
            <NumberInput
              value={widget.thickness ?? 4}
              min={1}
              max={120}
              fallback={4}
              onChange={(v) => set("thickness", v)}
            />
          </InlineField>
        </>
      )}

      {(widget.kind === "text" || widget.kind === "image") && (
        <Field label={widget.kind === "image" ? "Image URL" : "Static text"}>
          <TextInput
            value={widget.text}
            placeholder={widget.kind === "image" ? "https://… (or bind a sensor with a URL)" : "text"}
            onChange={(v) => set("text", v)}
          />
        </Field>
      )}

      {widget.kind === "image" && (
        <InlineField label="Max height (px)">
          <NumberInput
            value={widget.height}
            min={24}
            max={600}
            optional
            fallback={24}
            placeholder="auto"
            onChange={(v) => set("height", v)}
          />
        </InlineField>
      )}

      {widget.kind === "table" && (
        <>
          <InlineField label="Rows">
            <NumberInput
              value={widget.rows ?? 7}
              min={1}
              max={20}
              fallback={7}
              onChange={(v) => set("rows", v)}
            />
          </InlineField>
          <InlineField label="Columns" hint="split on “, ”">
            <NumberInput
              value={widget.columns}
              min={0}
              max={12}
              optional
              fallback={0}
              placeholder="auto"
              onChange={(v) => set("columns", v)}
            />
          </InlineField>
          <Field label="Header" hint="comma-separated">
            <TextInput
              value={widget.header}
              placeholder="Date, Weather, Temp, Precip, Wind"
              onChange={(v) => set("header", v)}
            />
          </Field>
        </>
      )}

      {widget.kind === "customGauge" && (
        <Field label="Gauge" hint="start from a preset; design it on the Gauges page">
          <select
            className={INPUT}
            value={STARTERS.find((s) => JSON.stringify(normalizeGauge(s.gauge)) === JSON.stringify(widget.vector ?? DEFAULT_GAUGE_SPEC))?.name ?? ""}
            onChange={(e) => {
              const s = STARTERS.find((x) => x.name === e.target.value);
              if (s) set("vector", normalizeGauge(s.gauge));
            }}
          >
            <option value="" disabled>
              Custom
            </option>
            {STARTERS.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      {widget.kind === "sparkline" && (
        <InlineField label="History samples">
          <NumberInput
            value={widget.history ?? 40}
            min={5}
            max={200}
            fallback={40}
            onChange={(v) => set("history", v)}
          />
        </InlineField>
      )}

      {(widget.kind === "bar" || widget.kind === "gauge") && (
        <>
          <InlineField label="Max (denominator)">
            <NumberInput value={widget.max ?? 100} min={0} float fallback={0} onChange={(v) => set("max", v)} />
          </InlineField>
          <Switch label="Invert fill" on={!!widget.inverted} onChange={(on) => set("inverted", on)} />
        </>
      )}

      {widget.kind === "clock" && (
        <Field label="Show">
          <Segmented
            options={[
              { value: "both", label: "Time + date" },
              { value: "time", label: "Time" },
              { value: "date", label: "Date" },
            ]}
            value={widget.clock ?? "both"}
            onChange={(v) => set("clock", v as Widget["clock"])}
            className={SEGMENTED_CLASS}
          />
        </Field>
      )}

      {ALIGNABLE.has(widget.kind) && (
        <Field label="Text alignment">
          <Segmented
            options={[
              { value: "left", label: "Left" },
              { value: "center", label: "Center" },
              { value: "right", label: "Right" },
            ]}
            value={widget.align ?? "left"}
            onChange={(v) => set("align", v as Widget["align"])}
            className={SEGMENTED_CLASS}
          />
        </Field>
      )}
    </>
  );
}

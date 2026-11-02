import { Minus, Plus } from "lucide-react";
import { Segmented } from "@/components/ui/segmented";
import { withLayout, type BoxAlign, type OverlayBand, type PanelDef, type PanelJustify } from "@/lib/panel-model";
import { AlignGrid } from "./align-grid";
import { splitTracks } from "./grid-tracks";
import { TrackEditor } from "./track-editor";
import { MediaField } from "./media-field";
import { SEGMENTED_CLASS, SelectRow } from "./setting-rows";
import { Field, InlineField, NumberInput, Switch } from "./widget-editor/fields";

type Layout = "stack" | "grid" | "overlay";

/** A segmented control spanning its row. */
const FULL = SEGMENTED_CLASS;

const BANDS: { band: OverlayBand; label: string }[] = [
  { band: "top", label: "Top" },
  { band: "middle", label: "Middle" },
  { band: "bottom", label: "Bottom" },
];

const JUSTIFY_OPTIONS = [
  { value: "start" as const, label: "Start" },
  { value: "center" as const, label: "Center" },
  { value: "end" as const, label: "End" },
  { value: "between" as const, label: "Spread" },
];

interface PanelLayoutSectionProps {
  panel: PanelDef;
  /** Set one panel field (one undo step per field while editing). */
  setField: <K extends keyof PanelDef>(key: K, value: PanelDef[K]) => void;
  /** Any panel edit; `key` names the undo step it coalesces into. */
  updatePanel: (fn: (p: PanelDef) => PanelDef, key?: string) => void;
}

/** A small "− n +" stepper. */
function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (n: number) => void }) {
  const btn =
    "flex h-6 w-6 items-center justify-center rounded-md border border-ui-default text-ui-3 hover:bg-ui-hover hover:text-ui-1 disabled:pointer-events-none disabled:opacity-40";
  return (
    <div className="flex items-center gap-1">
      <button type="button" className={btn} aria-label="Fewer" disabled={value <= min} onClick={() => onChange(value - 1)}>
        <Minus className="h-3 w-3" />
      </button>
      <span className="w-6 text-center font-ui-mono text-caption text-ui-1">{value}</span>
      <button type="button" className={btn} aria-label="More" disabled={value >= max} onClick={() => onChange(value + 1)}>
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}

/** Stack: direction, wrap, and justify + align on one AlignGrid. */
function StackFields({ panel, setField, updatePanel }: PanelLayoutSectionProps) {
  const row = (panel.direction ?? "row") === "row";
  const main = panel.justify;
  const cross = panel.align;
  return (
    <>
      <Field label="Direction">
        <Segmented
          options={[
            { value: "row", label: "Row" },
            { value: "column", label: "Column" },
          ]}
          value={row ? "row" : "column"}
          onChange={(v) => setField("direction", v)}
          className={FULL}
        />
      </Field>
      <Switch label="Wrap" on={panel.wrap ?? true} onChange={(on) => setField("wrap", on)} />
      <Field label="Alignment" hint={row ? "spread = across the row" : "spread = down the column"}>
        <AlignGrid
          label="Widget alignment"
          x={row ? main : cross}
          y={row ? cross : main}
          spread={row ? "x" : "y"}
          stretch={row ? "y" : "x"}
          onChange={(x, y) =>
            updatePanel(
              (p) => ({
                ...p,
                justify: (row ? x : y) as PanelJustify | undefined,
                align: (row ? y : x) as BoxAlign | undefined,
              }),
              "panel:align"
            )
          }
        />
      </Field>
    </>
  );
}

/** Grid: column count, column / row tracks. */
function GridFields({ panel, setField, updatePanel }: PanelLayoutSectionProps) {
  const columns = panel.columns ?? 3;
  return (
    <>
      <InlineField label="Columns">
        <Stepper
          value={panel.gridCols ? splitTracks(panel.gridCols).length : columns}
          min={1}
          max={12}
          onChange={(n) => updatePanel((p) => ({ ...p, columns: n, gridCols: undefined }), "panel:columns")}
        />
      </InlineField>
      <Field label="Column sizes">
        <TrackEditor
          name="Column"
          value={panel.gridCols}
          equalCount={columns}
          onChange={(v) =>
            updatePanel(
              (p) => ({
                ...p,
                gridCols: v,
                // Keep the count in step (spans clamp to it) unless a repeat() hides it.
                ...(v && !v.includes("repeat(") ? { columns: splitTracks(v).length } : null),
              }),
              "panel:gridCols"
            )
          }
        />
      </Field>
      <Field label="Row sizes">
        <TrackEditor name="Row" value={panel.gridRows} equalCount={0} onChange={(v) => setField("gridRows", v)} />
      </Field>
      <Field label="Cell alignment">
        <AlignGrid
          label="Cell alignment"
          x={panel.justify}
          y={panel.align}
          stretch="y"
          onChange={(x, y) =>
            updatePanel(
              (p) => ({ ...p, justify: x as PanelJustify | undefined, align: y as BoxAlign | undefined }),
              "panel:align"
            )
          }
        />
      </Field>
    </>
  );
}

/**
 * An overlay's background: which image widget fills it, and the dark
 * scrim over it. (The zone's own "Background image" in Colors & surface is
 * a separate picture behind the whole panel.)
 */
export function PanelBackgroundFields({ panel, setField, updatePanel }: PanelLayoutSectionProps) {
  const images = panel.widgets.filter((w) => w.kind === "image");
  const chosen = images.find((w) => w.asBackground);
  const shown = chosen ?? images[0];
  return (
    <>
      <SelectRow
        label="Background image"
        hint="which image widget fills the overlay"
        value={chosen?.id ?? ""}
        options={[
          { value: "", label: images.length > 0 ? "First image widget" : "None (add an image widget)" },
          ...images.map((w, i) => ({ value: w.id, label: w.label || w.sensor || w.text || `Image ${i + 1}` })),
        ]}
        onChange={(id) =>
          updatePanel((p) => ({
            ...p,
            widgets: p.widgets.map((w) => (w.kind === "image" ? { ...w, asBackground: w.id === id || undefined } : w)),
          }))
        }
      />
      {shown && (
        <MediaField
          label="Image URL"
          kind="image"
          value={shown.text}
          preview="thumb"
          onChange={(src) =>
            updatePanel(
              (p) => ({ ...p, widgets: p.widgets.map((w) => (w.id === shown.id ? { ...w, text: src } : w)) }),
              `panel-widget:${shown.id}:text`
            )
          }
        />
      )}
      <Switch label="Dim the image (dark scrim)" on={panel.scrim !== false} onChange={(on) => setField("scrim", on ? undefined : false)} />
    </>
  );
}

/** Overlay: per-band alignment, bottom grid. */
function OverlayFields({ panel, setField }: PanelLayoutSectionProps) {
  return (
    <>
      <Field label="Band alignment">
        {BANDS.map(({ band, label }) => (
          <div key={band} className="mb-1 flex items-center gap-2">
            <span className="w-12 shrink-0 text-[11.5px] text-ui-3">{label}</span>
            <Segmented
              options={JUSTIFY_OPTIONS}
              value={panel.overlayAlign?.[band] ?? "start"}
              onChange={(v) => setField("overlayAlign", { ...panel.overlayAlign, [band]: v })}
            />
          </div>
        ))}
      </Field>
      <InlineField label="Bottom band columns" hint="empty = a row">
        <NumberInput
          value={panel.bottomGridCols}
          min={1}
          max={12}
          optional
          fallback={1}
          placeholder="row"
          onChange={(v) => setField("bottomGridCols", v)}
        />
      </InlineField>
    </>
  );
}

/**
 * The Panel section's own fields (README 4.7): the editor (Visual / Code),
 * whether the panel fills its zone or hugs its content, gap and padding
 * (empty = auto).
 */
export function PanelMainFields({
  panel,
  setField,
  view,
  onView,
}: Pick<PanelLayoutSectionProps, "panel" | "setField"> & {
  view: "visual" | "code";
  onView: (view: "visual" | "code") => void;
}) {
  return (
    <>
      <Field label="Editor" hint="Code edits the panel as JSON (Apply or Ctrl+Enter, one undo step)">
        <Segmented
          options={[
            { value: "visual", label: "Visual" },
            { value: "code", label: "Code", title: "Edit the panel as JSON" },
          ]}
          value={view}
          onChange={onView}
          className={FULL}
        />
      </Field>
      <Field label="Size" hint="Fill its space, or shrink to the content">
        <Segmented
          options={[
            { value: "fill", label: "Fill", title: "Stretch over the whole space" },
            { value: "hug", label: "Hug", title: "Shrink to the content" },
          ]}
          value={panel.fit ?? "fill"}
          onChange={(v) => setField("fit", v === "fill" ? undefined : v)}
          className={FULL}
        />
        {panel.fit === "hug" && (
          <p className="mt-1 text-[11.5px] leading-snug text-ui-4">A hugging panel sits where Size &amp; alignment puts it.</p>
        )}
      </Field>
      <InlineField label="Gap">
        <NumberInput
          value={panel.gap}
          min={0}
          max={200}
          optional
          fallback={0}
          placeholder="auto"
          onChange={(v) => setField("gap", v)}
        />
      </InlineField>
      <InlineField label="Padding">
        <NumberInput
          value={panel.padding}
          min={0}
          max={200}
          optional
          fallback={0}
          placeholder="auto"
          onChange={(v) => setField("padding", v)}
        />
      </InlineField>
    </>
  );
}

/**
 * The panel's arrangement (the Layout section): Stack / Grid / Overlay with
 * each layout's own fields.
 */
export function PanelLayoutFields(props: PanelLayoutSectionProps) {
  const { panel, updatePanel } = props;
  const layout: Layout = panel.layout === "wrap" || !panel.layout ? "stack" : panel.layout;
  return (
    <>
      <Field label="Layout">
        <Segmented
          options={[
            { value: "stack", label: "Stack", title: "A row or column of widgets" },
            { value: "grid", label: "Grid", title: "Widgets in columns and rows" },
            { value: "overlay", label: "Overlay", title: "An image background with widgets in bands" },
          ]}
          value={layout}
          onChange={(v) => updatePanel((p) => withLayout(p, v), "panel:layout")}
          className={FULL}
        />
      </Field>
      {layout === "stack" && <StackFields {...props} />}
      {layout === "grid" && <GridFields {...props} />}
      {layout === "overlay" && <OverlayFields {...props} />}
    </>
  );
}

import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { PanelHead, Row, Switch } from "./bar-fields";
import { CELLS } from "./options";
import { DEFAULT_SPANS, DEFAULT_STATE, type QaState } from "./params";

/** The size presets: today's default, the sizes a small panel offers, the one-row bars, and a wide sweep. */
export const SIZE_PRESETS: { label: string; spans: string }[] = [
  { label: "Default", spans: DEFAULT_SPANS },
  { label: "Small panel", spans: "1x1,2x1,1x2,2x2" },
  { label: "Bars", spans: "2x1,3x1,4x1,6x1" },
  { label: "Everything", spans: "1x1,2x1,3x1,4x1,6x1,1x2,2x2,3x2,4x2,6x2,2x3,3x3,4x3,4x4" },
];

/** The Grid popover: the geometry every frame is drawn at. */
export function GridPanel({ state, onChange }: { state: QaState; onChange: (patch: Partial<QaState>) => void }) {
  const preset = SIZE_PRESETS.find((p) => p.spans === state.spans)?.spans ?? null;
  return (
    <div className="w-88 space-y-2">
      <PanelHead title="Grid" line="The cell, the gap and the sizes every widget is drawn at." />
      <Row id="cell" as="div">
        <span className="flex items-center gap-1.5">
          <Segmented label="Cell size" mono options={CELLS.map((c) => ({ value: c, label: String(c) }))} value={CELLS.includes(state.cell) ? state.cell : null} onChange={(cell) => onChange({ cell })} />
          <Field mono type="number" min={1} aria-label="Cell size in px" className="h-7 w-18 px-2 text-caption" value={state.cell} onChange={(e) => onChange({ cell: Number(e.target.value) || DEFAULT_STATE.cell })} />
        </span>
      </Row>
      <Row id="gap">
        <Field mono type="number" min={0} className="h-7 w-18 px-2 text-caption" value={state.gap} onChange={(e) => onChange({ gap: Number(e.target.value) || 0 })} />
      </Row>
      {/* the presets need the popover's width: the name above, not beside */}
      <Row id="spans" as="div" className="grid-cols-1 gap-1">
        <span className="space-y-1.5">
          <Segmented label="Size presets" options={SIZE_PRESETS.map((p) => ({ value: p.spans, label: p.label, title: p.spans }))} value={preset} onChange={(spans) => onChange({ spans })} />
          <Field mono aria-label="Sizes" className="h-7 w-full px-2 text-caption" value={state.spans} onChange={(e) => onChange({ spans: e.target.value })} />
        </span>
      </Row>
      <Switch id="grid" checked={state.grid} onChange={(grid) => onChange({ grid })} />
    </div>
  );
}

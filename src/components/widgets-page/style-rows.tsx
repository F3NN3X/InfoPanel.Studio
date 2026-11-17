// The Block tab's Phase E rows (builder audit G21, G22, G26, G36; recipe format 2): a value's and a label's weight and case, an opacity
// step beside a block's colour (a text is drawn at the step that keeps it readable on the Look shown, and the row says when that is
// higher than the one picked), a nested card's surface and padding, the root card's and a grid's spacing, a gauge's sweep and a bar's
// height. Each is an enum on the theme's own tokens; its first choice is unset, so a recipe that picks none keeps its bytes.
import { Segmented } from "@/components/ui/segmented";
import type { Block } from "@/widgets/recipe/types";
import { Field } from "./fields";

/** The rows' choices, each list's first the unset one (written as no key). */
/** Weight: unset is the Look's own ("Theme": regular text, a number in the Look's numeral weight, 700 on Classic); the others are explicit. */
const WEIGHTS = [
  { value: "", label: "Theme" },
  { value: "medium", label: "Medium" },
  { value: "semibold", label: "Semibold" },
];
const CASES = [
  { value: "", label: "As typed" },
  { value: "upper", label: "UPPER" },
];
const OPACITIES = [
  { value: "", label: "100 %" },
  { value: "80", label: "80 %" },
  { value: "60", label: "60 %" },
  { value: "40", label: "40 %" },
];
const SURFACES = [
  { value: "none", label: "None" },
  { value: "", label: "Track" },
  { value: "raised", label: "Raised" },
];
const PADDINGS = [
  { value: "none", label: "None" },
  { value: "s", label: "S" },
  { value: "", label: "M" },
  { value: "l", label: "L" },
];
const SPACINGS = [
  { value: "tight", label: "Tight" },
  { value: "", label: "Normal" },
  { value: "roomy", label: "Roomy" },
];
const SWEEPS = [
  { value: "180", label: "180°" },
  { value: "240", label: "240°" },
  { value: "", label: "270°" },
];
const HEIGHTS = [
  { value: "s", label: "S" },
  { value: "", label: "M" },
  { value: "l", label: "L" },
];

const FADES = new Set<Block["type"]>(["value", "label", "ring", "gauge", "bar", "sparkline", "heatmap"]);
/** The blocks whose opacity is a text's, held readable: a value, a label, a ring's centre value. */
const TEXTS = new Set<Block["type"]>(["value", "label", "ring", "gauge"]);

export interface StyleRowsProps {
  block: Block;
  /** The root card (its spacing; a nested card's surface and padding otherwise). */
  root: boolean;
  set: (patch: Record<string, unknown>) => void;
  /** The step the stage draws the block's text at (the highest of its Repeat items'), when it has an opacity. */
  drawn?: number;
}

/**
 * A segmented row whose "" choice is unset: picking it removes the key. `number` writes the value as a number (an opacity, a sweep).
 */
export function EnumRow({ label, hint, value, options, number, onPick }: { label: string; hint?: string; value: unknown; options: { value: string; label: string }[]; number?: boolean; onPick: (v: string | number | undefined) => void }) {
  return (
    <Field label={label} hint={hint}>
      <Segmented label={label} value={value === undefined ? "" : String(value)} options={options} onChange={(v) => onPick(v === "" ? undefined : number ? Number(v) : v)} />
    </Field>
  );
}

export function StyleRows({ block, root, set, drawn }: StyleRowsProps) {
  const raw = block as unknown as Record<string, unknown>;
  const want = raw.opacity as number | undefined;
  const text = TEXTS.has(block.type) && (block.type === "value" || block.type === "label" || (block as { center?: boolean }).center !== false);
  return (
    <>
      {(block.type === "value" || block.type === "label") && (
        <>
          <EnumRow label="Weight" hint={block.type === "value" ? "Theme: the Look's own weights (its numbers often bold). Medium and Semibold set 500 and 600 for the label and the number; a Look that sets its numbers' weight keeps it" : "Theme: the Look's own weight. Medium and Semibold set 500 and 600, in the Look's font"} value={block.weight} options={WEIGHTS} onPick={(v) => set({ weight: v })} />
          <EnumRow label="Case" hint={block.type === "value" ? "The label in capitals; the unit keeps its own" : "The text in capitals"} value={block.case} options={CASES} onPick={(v) => set({ case: v })} />
        </>
      )}
      {FADES.has(block.type) && (
        <>
          <EnumRow
            label="Opacity"
            hint={text ? "Text is never drawn under 4.5:1 on its card: a step too faint for the Look is raised" : "The mark at that step; its track stays"}
            value={want}
            options={OPACITIES}
            number
            onPick={(v) => set({ opacity: v })}
          />
          {want !== undefined && drawn !== undefined && drawn > want && (
            <p data-opacity-raised={drawn} className="text-caption leading-snug text-ui-3">
              Shown at {drawn} % on this Look to stay readable
            </p>
          )}
        </>
      )}
      {block.type === "card" && !root && (
        <>
          <EnumRow label="Surface" hint="Track is the tint it has always had; Raised lifts it off the card" value={block.surface} options={SURFACES} onPick={(v) => set({ surface: v })} />
          <EnumRow label="Padding" hint="Room inside the card: None, 4, 8 or 12 px" value={block.padding} options={PADDINGS} onPick={(v) => set({ padding: v })} />
        </>
      )}
      {block.type === "card" && root && <EnumRow label="Spacing" hint="Room between the card's blocks: 2, 6 or 12 px" value={block.spacing} options={SPACINGS} onPick={(v) => set({ spacing: v })} />}
      {block.type === "grid" && <EnumRow label="Spacing" hint="Room between the grid's cells: 2, 6 or 12 px" value={block.spacing} options={SPACINGS} onPick={(v) => set({ spacing: v })} />}
      {block.type === "gauge" && <EnumRow label="Sweep" hint="How far round the gauge's arc goes" value={block.sweep} options={SWEEPS} number onPick={(v) => set({ sweep: v })} />}
      {block.type === "bar" && <EnumRow label="Height" hint="The bar's thickness: 4, 8 or 14 px" value={block.height} options={HEIGHTS} onPick={(v) => set({ height: v })} />}
    </>
  );
}

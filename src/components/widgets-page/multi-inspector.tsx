// The multi-block inspector (builder plan Phase 6, B1's deferred item): with several blocks selected, the fields they all have, each
// showing their common value or "Mixed"; a change sets it on every one of them as one edit (one undo step). Blocks of one grid with
// tracks also align and distribute their areas (`zone-arrange.ts` through `arrangeAreas`). Prior art: `infopanel/edit/multi-inspector.tsx`.
import type { ArrangeOp } from "@/components/studio/zone-arrange";
import { Button } from "@/components/ui/button";
import type { Block, Recipe } from "@/widgets/recipe/types";
import { blockAt, type Path, updateBlock } from "./builder-model";
import { Field, Heading, NumberInput, Select } from "./fields";
import { arrangeAreas, fillAxis, setFill } from "./layout-model";

/** A field several blocks can share: the types that have it, and its choices (else a number in `range`). */
interface Shared {
  key: string;
  label: string;
  on: readonly Block["type"][] | "all";
  choices?: readonly { value: string; label: string }[];
  range?: [number, number, number];
  /** The choice a number is written as (an opacity, a sweep). */
  number?: boolean;
}

const COLOURS = [
  { value: "accent", label: "Accent" },
  ...[1, 2, 3, 4, 5, 6].map((n) => ({ value: `series-${n}`, label: `Series ${n}` })),
];
const MARKS: Block["type"][] = ["ring", "gauge", "bar", "sparkline", "value", "heatmap"];
const TEXTS: Block["type"][] = ["value", "label"];

/** The fields the multi-block inspector offers, in the Block tab's order. `""` is unset. */
export const SHARED: readonly Shared[] = [
  { key: "color", label: "Colour", on: MARKS, choices: COLOURS },
  { key: "opacity", label: "Opacity", on: ["value", "label", "ring", "gauge", "bar", "sparkline", "heatmap"], number: true, choices: [{ value: "", label: "100 %" }, { value: "80", label: "80 %" }, { value: "60", label: "60 %" }, { value: "40", label: "40 %" }] },
  { key: "scale", label: "Text size", on: ["value", "label", "ring", "gauge", "weather-icon"], range: [0.5, 6, 0.05] },
  { key: "weight", label: "Weight", on: TEXTS, choices: [{ value: "", label: "Theme" }, { value: "medium", label: "Medium" }, { value: "semibold", label: "Semibold" }] },
  { key: "case", label: "Case", on: TEXTS, choices: [{ value: "", label: "As typed" }, { value: "upper", label: "UPPER" }] },
  { key: "align", label: "Align", on: TEXTS, choices: [{ value: "start", label: "Start" }, { value: "center", label: "Centre" }, { value: "end", label: "End" }] },
  { key: "motion", label: "Motion", on: "all", choices: [{ value: "", label: "None" }, { value: "fade-in", label: "Fade in" }] },
  { key: "grow", label: "Share of its row", on: "all", range: [0, 12, 0.1] },
];

/** The fields every block of `blocks` has. */
export const sharedFields = (blocks: readonly Block[]): Shared[] => SHARED.filter((f) => f.on === "all" || blocks.every((b) => (f.on as readonly string[]).includes(b.type)));

/** The blocks' common value of `key` as its field shows it ("" unset), or undefined when they differ. */
export function commonValue(blocks: readonly Block[], key: string): string | undefined {
  const values = new Set(blocks.map((b) => String((b as unknown as Record<string, unknown>)[key] ?? "")));
  return values.size === 1 ? [...values][0] : undefined;
}

/** Every block at `paths` with `key` set to `value` (undefined: unset), as one recipe. */
export const setAll = (recipe: Recipe, paths: readonly Path[], key: string, value: unknown): Recipe => paths.reduce((r, p) => updateBlock(r, p, { [key]: value }), recipe);

const MIXED = "\u0000mixed";
const ARRANGE: readonly { op: ArrangeOp; label: string }[] = [
  { op: "align-left", label: "Left" },
  { op: "align-right", label: "Right" },
  { op: "align-top", label: "Top" },
  { op: "align-bottom", label: "Bottom" },
  { op: "distribute-h", label: "Across" },
  { op: "distribute-v", label: "Down" },
];

export interface MultiInspectorProps {
  recipe: Recipe;
  /** The selected blocks (the root left out), the primary among them. */
  paths: readonly Path[];
  primary: Path;
  onChange: (recipe: Recipe, text: string) => void;
  onWhy: (why: string) => void;
}

export function MultiInspector({ recipe, paths, primary, onChange, onWhy }: MultiInspectorProps) {
  const blocks = paths.map((p) => blockAt(recipe, p)).filter((b): b is Block => !!b);
  if (blocks.length < 2) return null;
  const fields = sharedFields(blocks);
  const fills = paths.every((p) => fillAxis(recipe, p));
  // blocks with areas in one grid
  const areas = paths.every((p) => blockAt(recipe, p)?.area) && new Set(paths.map((p) => p.slice(0, -1).join("."))).size === 1;
  const set = (f: Shared, raw: string) => {
    if (raw === MIXED) return;
    const value = raw === "" ? undefined : f.number ? Number(raw) : raw;
    onChange(setAll(recipe, paths, f.key, value), `${f.label} set on ${blocks.length} blocks`);
  };
  return (
    <div data-multi-inspector="" className="flex flex-col gap-2 px-4 pb-4">
      <Heading>Shared by all {blocks.length}</Heading>
      {fields.map((f) => {
        const common = commonValue(blocks, f.key);
        if (f.range)
          return (
            <Field key={f.key} label={f.label} hint={common === undefined ? "Mixed: a value typed here is set on every one" : undefined}>
              <NumberInput
                label={`${f.label}, all selected`}
                value={common === undefined || common === "" ? undefined : Number(common)}
                placeholder={common === undefined ? "Mixed" : f.key === "grow" ? "1" : "Own"}
                min={f.range[0]}
                max={f.range[1]}
                step={f.range[2]}
                onChange={(v) => onChange(setAll(recipe, paths, f.key, f.key === "grow" && v === 1 ? undefined : v), `${f.label} set on ${blocks.length} blocks`)}
              />
            </Field>
          );
        const options = [...(common === undefined ? [{ value: MIXED, label: "Mixed" }] : []), ...(f.choices ?? [])];
        return (
          <Field key={f.key} label={f.label}>
            <Select label={`${f.label}, all selected`} value={common ?? MIXED} options={options} onChange={(v) => set(f, v)} width={130} />
          </Field>
        );
      })}
      {fills && (
        <Field label="Part across" hint="Each one's part of its column's width or its row's height">
          <NumberInput
            label="Part across, all selected"
            value={commonValue(blocks, "fill") === undefined ? undefined : Math.round(Number(commonValue(blocks, "fill") || 1) * 100)}
            placeholder={commonValue(blocks, "fill") === undefined ? "Mixed" : "100"}
            min={10}
            max={100}
            unit="%"
            onChange={(v) => onChange(paths.reduce((r, p) => setFill(r, p, v === undefined ? undefined : Math.max(10, Math.min(100, v)) / 100, blockAt(r, p)?.place), recipe), `Part across set on ${blocks.length} blocks`)}
          />
        </Field>
      )}
      {areas && (
        <>
          <Heading>Align and distribute</Heading>
          <div data-arrange="" className="grid grid-cols-3 gap-1.5">
            {ARRANGE.map((a) => (
              <Button
                key={a.op}
                small
                variant="ghost"
                onClick={() => {
                  const r = arrangeAreas(recipe, paths, primary, a.op);
                  if ("why" in r) return onWhy(r.why);
                  onChange(r, `${a.op.startsWith("align") ? "Aligned" : "Distributed"} ${blocks.length} blocks`);
                }}
              >
                {a.label}
              </Button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

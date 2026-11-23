// "Check every size" (builder plan Phase 3, B2 Q1's "later"): the stage measures crowding at the size it shows only, so on demand the
// builder draws the recipe offscreen at every size in its range, a batch at a time, and lists each size where a text is under the floor
// or a block is cut, cramped, past the card or overlapping. The spans and the floor findings are pure; `SizeCheckRun` draws and measures.
import { type CSSProperties, useEffect, useRef, useState } from "react";
import type { Appearance } from "@/lib/style-resolve";
import { TEXT_FLOOR } from "@/widgets/recipe/metrics";
import type { Cells, PackageFile, Recipe } from "@/widgets/recipe/types";
import { floorAt } from "@/widgets/recipe/validate";
import { blockAt, layerName } from "./builder-model";
import { crowdIssues, crowding, measureInks } from "./crowding";
import type { PlainIssue } from "./plain-issues";
import { RecipePreview, zonePx } from "./recipe-preview";

/** What one size of the check found. */
export interface SpanResult {
  cells: Cells;
  issues: PlainIssue[];
}

/** Every size in the recipe's range, Smallest to Largest: columns, then rows. */
export function spansOf(recipe: Recipe): Cells[] {
  const { min, max } = recipe.size;
  const out: Cells[] = [];
  for (let c = min[0]; c <= max[0]; c++) for (let r = min[1]; r <= max[1]; r++) out.push([c, r]);
  return out;
}

/** The texts under the floor at `cells`, as the problem list's warnings: "At 2×1, Value's text is 9.5 px, under 11 px". */
export function floorIssues(recipe: Recipe, cells: Cells): PlainIssue[] {
  return floorAt(recipe, cells).map((f) => {
    const b = blockAt(recipe, f.path);
    return { text: `At ${cells[0]}×${cells[1]}, ${b ? layerName(recipe, b) : "a text"}'s text is ${f.px.toFixed(1)} px, under ${TEXT_FLOOR} px`, tab: "block", path: f.path, warn: true };
  });
}

/** How many sizes are drawn at once offscreen. */
const BATCH = 12;

export interface SizeCheckRunProps {
  /** The recipe as the stage draws it (with its Sample when the stage shows that). */
  recipe: Recipe;
  /** The recipe the findings name their blocks by. */
  named: Recipe;
  spans: readonly Cells[];
  values?: Record<string, unknown>;
  sample: boolean;
  appearance?: Appearance;
  pageStyle?: CSSProperties;
  lookId?: string;
  images?: readonly PackageFile[];
  /** After each batch: how many sizes are checked. */
  onProgress: (done: number) => void;
  /** The sizes with findings, smallest first. */
  onDone: (found: SpanResult[]) => void;
}

/**
 * Draws the recipe at each of `spans` offscreen, `BATCH` at a time at their nominal px (scale 1), and measures each after it has laid out
 * (as the stage does: a moment for the card and its labels to fit, then a frame).
 */
export function SizeCheckRun(p: SizeCheckRunProps) {
  const [at, setAt] = useState(0);
  const found = useRef<SpanResult[]>([]);
  const host = useRef<HTMLDivElement>(null);
  const batch = p.spans.slice(at, at + BATCH);
  const call = useRef(p);
  call.current = p;
  useEffect(() => {
    let frame = 0;
    const timer = setTimeout(() => {
      frame = requestAnimationFrame(() => {
        const { named, spans, onProgress, onDone } = call.current;
        const zones = [...(host.current?.querySelectorAll<HTMLElement>("[data-recipe-zone]") ?? [])];
        batch.forEach((cells, k) => {
          const m = zones[k] && measureInks(zones[k]);
          const issues = [...floorIssues(named, cells), ...crowdIssues(named, cells, m ? crowding(m.inks, m.card) : [])];
          if (issues.length) found.current.push({ cells, issues });
        });
        const next = at + BATCH;
        onProgress(Math.min(next, spans.length));
        if (next >= spans.length) onDone(found.current);
        else setAt(next);
      });
    }, 120);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [at]);
  return (
    <div ref={host} aria-hidden inert data-size-check-run="" className="pointer-events-none fixed -left-5000 top-0 flex flex-col items-start gap-4">
      {batch.map((cells) => (
        <RecipePreview key={`${at} ${cells.join("x")}`} recipe={p.recipe} images={p.images} values={p.values} cells={cells} sample={p.sample} appearance={p.appearance} pageStyle={p.pageStyle} lookId={p.lookId} fit={zonePx(cells)} />
      ))}
    </div>
  );
}

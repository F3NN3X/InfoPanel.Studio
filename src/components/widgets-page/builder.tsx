// The recipe builder (Phase 5b, screenshots 04-08): Layers and "Add a block" on the left, the stage at a chosen zone size in the
// middle ("Preview in <theme>", Live data or Sample, the validation line), the inspector's Block, Options and Presets tabs on the
// right. The page holds each open recipe's history (undo, redo) so its tabs keep their own; Save stores it through /api/widgets.
// Layers moves a block into, out of and between containers by drag or Alt+arrows (Phase A, G1); a field's draft shows on the stage
// while it is typed and is one undo step when it commits (G5); the validation line lists every problem in plain words (G6).
// Phase B1: the layer menu, Copy, Cut and Paste across the open recipes, a selection of several blocks and Wrap in a row, tiles
// dragged onto Layers or the stage, Close and Discard, Ctrl+S, and Layers as an APG tree whose rows carry their problems; moves,
// pastes and refusals are said in a live region.
// Phase B2: the stage at any size in the recipe's range, the Sample before a save, crowding warnings at the size it shows (each in the
// problem list and as a Layers dot), and the line says "fits" only when that measure backs it.
// Phase D: hide and lock in the editor (G25), a new Image asks for its picture first (G32), the offer to remove what a delete left
// unused (G34), snippets (G35) and the Header row (G37).
// Builder plan Phase 1 (the flow model, D2 A): on the stage a block drags to another place or container (`stage-edit.ts`, a drop line
// and the refusal's reason, Esc cancels, one undo step), share handles change two blocks' shares (`share-handles.tsx`), Ctrl and
// Shift click add to the selection, and the focused stage takes the arrows (walk), Alt+arrows (move), Del, F2 and Esc.
// Phase 2: the layer menu on the stage too (`layer-entries.tsx`), with Wrap in a card or a grid, Unwrap, and Copy and Paste style.
// Phase 3: "Check every size" draws the recipe offscreen at each size in its range and lists what is crowded or under the floor (`size-check.tsx`).
// Phase 5 (format 2): in a grid with tracks a block's body drags it a track at a time and its handles size its area (`area-handles.tsx`),
// Alt+arrows nudge it a track and Alt+Shift+arrows size it; a block in a column or a row has handles on its other two sides for its
// part of the room across; the layer menu's Layer flyout sets a background and the drawing order (`layout-model.ts`).
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { pastDragThreshold, trackPointer } from "@/components/studio/pointer-drag";
import { ChevronRight, CircleAlert, CircleCheck, MonitorUp, Pencil, Redo2, RotateCcw, Save, Undo2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Segmented } from "@/components/ui/segmented";
import { StatusChip } from "@/components/ui/status-chip";
import { Tabs } from "@/components/ui/tabs";
import { BarFill, PageBar } from "@/components/studio/page-bar";
import { ContextMenu } from "@/components/ui/context-menu";
import { useSensors } from "@/hooks/useSensors";
import { withHwinfoAliases } from "@/lib/hwinfo-aliases";
import type { Appearance } from "@/lib/style-resolve";
import { skinLabel } from "@/lib/theme-skins";
import { cn } from "@/lib/utils";
import { GALLERY_IDS } from "@/components/studio/look-gallery-model";
import { SAMPLE_THEMES } from "@/looks/sample-themes";
import type { Data } from "@/widgets/core/types";
import { gridPresets } from "@/widgets/define";
import type { BlockType, Cells, PackageFile, Recipe, RecipeOption } from "@/widgets/recipe/types";
import { toFlat, toNames } from "@/widgets/shared/data-adapter";
import { ADD_ORDER, addBlock, addBlockAt, addImageAt, addRefusal, addSnippet, BLOCK_LABEL, blockAt, CELLS_MAX, cleanUp, devicesIn, draftSample, duplicateBlocks, flatten, imagePath, keyMove, landing, layerName, leftUnused, moveBlock, moveBlocks, moveTargets, nextVersion, outsideRange, packedImages, presetValues, rangeOf, recipeIssues, removeBlocks, SNIPPETS, type SnippetId, stageCells, stepBlock, topLevel, updateBlock, validationLine, unwrap, withFormat, wrapIn, type Path } from "./builder-model";
import { BlockIcon } from "./block-icons";
import { BlockTab } from "./block-tab";
import { clipboard, copyOf, copyStyle, pasteBlocks, pasteStyle, setClipboard, setStyleClipboard, styleClipboard } from "./clipboard";
import { type Crowd, crowdIssues, crowding, measureInks } from "./crowding";
import { type EditorFlags, flagged, flagsOn, followFlags, hiddenRule, loadFlags, saveFlags, setKeys, stagePick } from "./editor-flags";
import { NumberInput, type Typing, TypingContext } from "./fields";
import type { History } from "./history";
import { layerEntries } from "./layer-entries";
import { type EditorFlag, type LayerCommand, Layers, type SelectHow } from "./layers";
import { MultiInspector } from "./multi-inspector";
import { OptionsTab } from "./options-tab";
import { type PlainIssue, plainIssue, plainIssues, plainWarnings } from "./plain-issues";
import { PresetsTab } from "./presets-tab";
import { RecipePreview, zonePx } from "./recipe-preview";
import { AreaHandles, FillHandles, measureArea } from "./area-handles";
import { areaGrid, areaNow, dragArea, fitLayout, nudgeArea, restack, setArea, setBackground, stepAreaSize, trackAt } from "./layout-model";
import { ShareHandles } from "./share-handles";
import { SizeCheckRun, type SpanResult, spansOf } from "./size-check";
import { type Carry, dragTarget, dropAt, type StageDrop, stageStep } from "./stage-edit";
import { isUnsaved } from "./widgets-model";

/** An open recipe: its history, its images and what is stored (undefined: never saved). */
export interface Draft {
  key: string;
  history: History<Recipe>;
  images: PackageFile[];
  stored?: Recipe;
}

export interface BuilderProps {
  drafts: readonly Draft[];
  active: Draft;
  onActive: (key: string) => void;
  /** An edit of the active recipe (one undo step; `amend`: folded into the last one, a paste after a cut). */
  onEdit: (recipe: Recipe, images?: PackageFile[], amend?: boolean) => void;
  onUndo: () => void;
  onRedo: () => void;
  onBack: () => void;
  onSave: () => void;
  /** The recipe on the server is signed (6a Q2): an edit is saved as a copy under a new id, the signed one stays as it is. */
  onSaveCopy?: () => void;
  saving: boolean;
  onExport: () => void;
  onAddToScreen: (presetId: string | null) => void;
  /** Close the open recipe (the page asks first when it has unsaved changes). */
  onClose: () => void;
  /** Back to the stored version (the page asks first). */
  onDiscard: () => void;
  /** The page's question about closing or discarding, shown under the bar. */
  prompt?: ReactNode;
  appearance?: Appearance;
  pageStyle?: CSSProperties;
  onOpenSources: () => void;
}

type Tab = "block" | "options" | "presets";

/** "Preview in": Classic, then the skin and sample Looks, by name. */
const LOOKS = GALLERY_IDS.map((id) => ({ value: id, label: id === "classic" ? "Classic" : (SAMPLE_THEMES.find((t) => t.id === id)?.name ?? skinLabel(id)) }));

/** The sizes the stage offers: the smallest, each preset's, the largest and the one it shows, smallest first (at most six). */
export function stageSizes(recipe: Recipe, shown?: Cells): Cells[] {
  const all = [recipe.size.min, recipe.size.default, ...gridPresets(recipe.presets).map((p) => p.size), recipe.size.max, ...(shown ? [shown] : [])];
  const seen = new Map(all.map((c) => [`${c[0]}x${c[1]}`, c] as const));
  return [...seen.values()].sort((a, b) => a[0] * a[1] - b[0] * b[1] || a[0] - b[0]).slice(0, 6);
}

/** The draft's state line: what saving means now. */
function savedChip(d: Draft): { text: string; tone: "neutral" | "warn" } {
  if (!d.stored) return { text: "Not saved yet", tone: "warn" };
  return isUnsaved(d) ? { text: "Unsaved changes", tone: "warn" } : { text: "Recipe · saved", tone: "neutral" };
}


/** The room the selection's name tag takes beside its block, in the zone's px (11 px text, its padding and gap). */
const TAG_ROOM = 24;

/**
 * Where the selection's name tag goes: under the block where there is room above `floor` (the weather credit line's top, else the
 * zone's bottom), else over the block, else inside its top corner. Never over the credit line (B12), which sits right under a Repeat
 * that fills the card.
 */
export const tagPlace = (box: { y: number; h: number }, floor: number): "under" | "over" | "inside" => (floor - (box.y + box.h) >= TAG_ROOM ? "under" : box.y >= TAG_ROOM ? "over" : "inside");
const TAG_CLASS = { under: "left-0 top-full mt-1", over: "left-0 bottom-full mb-1", inside: "left-1 top-1" } as const;

/** The selection's outline and name tag; `also` one of the other blocks picked with Ctrl or Shift: a thinner outline, no tag. */
function Selection({ zone, path, recipe, tick, also }: { zone: HTMLElement | null; path: Path; recipe: Recipe; tick: unknown; also?: boolean }) {
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number; floor: number } | null>(null);
  useLayoutEffect(() => {
    const at = path.join(".");
    const el = at ? zone?.querySelector<HTMLElement>(`[data-recipe-path="${at}"]`) : zone?.querySelector<HTMLElement>("[data-part='card']");
    if (!zone || !el) return setBox(null);
    const z = zone.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const scale = z.width / zone.offsetWidth || 1;
    const credit = zone.querySelector<HTMLElement>("[data-recipe-attribution], [data-recipe-sample]")?.getBoundingClientRect();
    setBox({ x: (r.left - z.left) / scale, y: (r.top - z.top) / scale, w: r.width / scale, h: r.height / scale, floor: credit ? (credit.top - z.top) / scale : zone.offsetHeight });
  }, [zone, path.join("."), tick]);
  const b = blockAt(recipe, path);
  if (!box || !b || !path.length) return null;
  const tag = TAG_CLASS[tagPlace(box, box.floor)];
  if (also)
    return (
      <div aria-hidden data-selection-also="" className="pointer-events-none absolute z-10 rounded-[6px] border border-dashed border-ui-accent" style={{ left: box.x - 2, top: box.y - 2, width: box.w + 4, height: box.h + 4 }} />
    );
  return (
    <div aria-hidden className="pointer-events-none absolute z-10" style={{ left: box.x - 3, top: box.y - 3, width: box.w + 6, height: box.h + 6 }}>
      <div className="h-full w-full rounded-[6px] border-2 border-ui-accent" />
      <span data-selection-tag="" className={`absolute ${tag} whitespace-nowrap rounded-[4px] bg-ui-accent px-1.5 py-0.5 font-ui text-[11px] font-medium text-white`}>{layerName(recipe, b)}</span>
    </div>
  );
}

/** The stage's drop mark: an outline on the container a tile or a dragged block goes into, else a line on the side of the block it goes by. */
function DropMark({ zone, drop, verb, tick }: { zone: HTMLElement | null; drop: StageDrop; verb: "Add" | "Move"; tick: unknown }) {
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = drop.key ? zone?.querySelector<HTMLElement>(`[data-recipe-path="${drop.key}"]`) : zone?.querySelector<HTMLElement>("[data-part='card']");
    if (!zone || !el) return setBox(null);
    const z = zone.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const scale = z.width / zone.offsetWidth || 1;
    setBox({ x: (r.left - z.left) / scale, y: (r.top - z.top) / scale, w: r.width / scale, h: r.height / scale });
  }, [zone, drop.key, tick]);
  if (!box) return null;
  const tone = drop.why ? "border-ui-warn" : "border-ui-accent";
  const line = drop.where === "inside" ? null : drop.across ? { left: drop.where === "before" ? -2 : box.w, top: 0, width: 2, height: box.h } : { left: 0, top: drop.where === "before" ? -2 : box.h, width: box.w, height: 2 };
  return (
    <div data-stage-drop={drop.why ? "refused" : drop.where} className="pointer-events-none absolute z-20" style={{ left: box.x, top: box.y, width: box.w, height: box.h }}>
      {line ? <div className={cn("absolute", drop.why ? "bg-ui-warn" : "bg-ui-accent")} style={line} /> : <div className={cn("h-full w-full rounded-[6px] border-2 border-dashed", tone)} />}
      <span className={cn("absolute left-0 top-full mt-1 whitespace-nowrap rounded-[4px] px-1.5 py-0.5 font-ui text-[11px] font-medium", drop.why ? "border border-ui-warn bg-ui-panel text-ui-warn" : "bg-ui-accent text-white")}>{drop.why ?? `${verb} ${drop.text}`}</span>
    </div>
  );
}

export function Builder(p: BuilderProps) {
  const present = p.active.history.present;
  // a field's draft while it is typed (G5): drawn on the stage and in the inspector, no undo step until it commits
  const [preview, setPreview] = useState<Recipe | null>(null);
  const recipe = preview ?? present;
  useEffect(() => setPreview(null), [present]);
  const previewing = useRef(false);
  /** Every edit of the recipe, with the format its keys need: one undo step, or while a field is typed its preview. */
  const edit = (r: Recipe, images?: PackageFile[], amend?: boolean) => {
    // the layout keys kept where they mean something after a move, a paste or a wrap (`fitLayout`), then the format they need
    const next = withFormat(fitLayout(r));
    if (previewing.current) return setPreview(next);
    setPreview(null);
    p.onEdit(next, images, amend);
  };
  const typing = useMemo<Typing>(
    () => ({
      preview: (run) => {
        previewing.current = true;
        try {
          run();
        } finally {
          previewing.current = false;
        }
      },
      cancel: () => setPreview(null),
    }),
    [],
  );
  // the selection (G11): the primary block (the Block tab's) and the others picked with Ctrl or Shift in Layers
  const [path, setPrimary] = useState<number[]>([]);
  const [also, setAlso] = useState<number[][]>([]);
  const anchor = useRef<number[]>([]);
  // the Header pseudo-row picked (G37): the root card's title, sub-title and icon in the Block tab
  const [header, setHeader] = useState(false);
  /** Selects `paths`, the primary the last unless named. */
  const setSelection = (paths: readonly number[][], primary: number[] = paths[paths.length - 1] ?? []) => {
    setHeader(false);
    setPrimary(primary);
    setAlso(paths.filter((x) => x.join(".") !== primary.join(".")));
    anchor.current = primary;
  };
  const setPath = (at: number[]) => setSelection([at]);
  const [tab, setTab] = useState<Tab>("block");
  const [size, setSize] = useState<Cells>(recipe.size.default);
  // the stage in a rail slot (a rail preset shown, or Rail picked in Size, P6)
  const [inRail, setInRail] = useState(false);
  const [live, setLive] = useState(true);
  const [lookId, setLookId] = useState("classic");
  const [preset, setPreset] = useState<string | null>(recipe.presets.find((x) => x.default)?.id ?? null);
  const [name, setName] = useState<string | null>(null);
  const zoneHost = useRef<HTMLDivElement>(null);
  const [stageBox, setStageBox] = useState({ w: 700, h: 600 });
  const stageRef = useRef<HTMLDivElement>(null);

  // the stage follows the size of the preset it shows when that changes
  const shownPreset = recipe.presets.find((x) => x.id === preset);
  const presetSize = shownPreset && shownPreset.size !== "rail" ? shownPreset.size.join("x") : undefined;
  const hasRail = recipe.presets.some((x) => x.size === "rail");
  const railShown = inRail && hasRail;
  useEffect(() => {
    if (presetSize) setSize(presetSize.split("x").map(Number) as Cells);
  }, [presetSize]);
  // and goes into the rail slot when the preset it shows becomes a rail preset, out of it when it leaves
  const presetRail = shownPreset?.size === "rail";
  useEffect(() => setInRail(presetRail), [presetRail]);

  // a different recipe (a tab, a new one) starts at its own default
  useEffect(() => {
    setPath([]);
    setSize(recipe.size.default);
    setInRail(false);
    const d = recipe.presets.find((x) => x.default);
    setPreset(d?.id ?? null);
  }, [p.active.key]);

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setStageBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // the readings the stage and the Block tab show: live (HWiNFO under the Libre keys too), else the recipe's sample
  const sensors = useSensors(null);
  const liveData = useMemo(() => toFlat(withHwinfoAliases(sensors)) as Data, [sensors]);
  const names = useMemo(() => toNames(withHwinfoAliases(sensors)) as Record<string, string>, [sensors]);
  // the Sample before a save (G18): the recipe's own sample, and the live reading of each key it reads that the sample has not got,
  // taken when the recipe changes (not on every tick, so the Sample holds still)
  const liveNow = useRef(liveData);
  liveNow.current = liveData;
  const liveReady = Object.keys(liveData).length > 0;
  const sampled = useMemo(() => draftSample(recipe, liveNow.current), [recipe, liveReady]);
  const sampleData = useMemo(() => Object.fromEntries(Object.entries(sampled.sample.sensors).map(([k, v]) => [k, String(v)])) as Data, [sampled.sample.sensors]);
  const data = live ? liveData : sampleData;
  const devices = useMemo(() => devicesIn({ ...sampleData, ...liveData }), [sampleData, liveData]);
  const issues = useMemo(() => recipeIssues(recipe, packedImages(recipe, p.active.images)), [recipe, p.active.images]);
  const line = validationLine(recipe, issues);
  const problems = plainIssues(recipe, issues);
  const first = problems[0]?.text;
  // crowding at the size the stage shows (G19, B11), measured after it draws; null until then
  const [crowds, setCrowds] = useState<Crowd[] | null>(null);
  // the opacity step each faded text is drawn at on the Look shown (Phase E), by block path: the Block tab says when it was raised
  const [drawn, setDrawn] = useState<Record<string, number>>({});
  const warnings = crowds ? crowdIssues(recipe, size, crowds) : [];
  // the validator's own warnings (a warning level past critical with high is bad): at every size, and no stop to a save
  const cautions = plainWarnings(recipe, issues);
  const listed = [...problems, ...cautions, ...warnings];
  const floorIssue = issues.find((i) => i.rule === "text-floor");
  /** A problem clicked: its block selected in its tab, or the Options or Presets tab. */
  const goTo = (x: PlainIssue) => {
    if (x.path) setPath(x.path);
    setTab(x.tab);
  };
  const chip = savedChip(p.active);
  const sizes = stageSizes(recipe, size);
  // the stage shows the picked preset (its values change in the Presets tab), else the options' defaults
  const shownValues = presetValues(recipe, recipe.presets.find((x) => x.id === preset));

  const selected = [...also.filter((x) => blockAt(recipe, x)), path];
  const keyOf = (x: Path) => x.join(".");
  const pathOf = (key: string): number[] => (key ? key.split(".").map(Number) : []);
  /** A pick in Layers: that row only, added or taken away (Ctrl), or a range from the last pick (Shift). */
  const select = (at: number[], how: SelectHow) => {
    setTab("block");
    if (how === "only") return setPath(at);
    if (how === "range") {
      const rows = rangeOf(flatten(recipe).map((r) => keyOf(r.path)), keyOf(anchor.current), keyOf(at));
      setHeader(false);
      setPrimary(at);
      return setAlso(rows.filter((x) => keyOf(x) !== keyOf(at)));
    }
    const on = selected.some((x) => keyOf(x) === keyOf(at));
    const rest = selected.filter((x) => keyOf(x) !== keyOf(at));
    if (on && rest.length) return setSelection(rest);
    setSelection([...rest, at]);
  };
  // each block's problems, for Layers' warning dots
  const problemMap = new Map<string, string[]>();
  for (const x of listed) if (x.path) problemMap.set(keyOf(x.path), [...(problemMap.get(keyOf(x.path)) ?? []), x.text]);

  // what the builder says to a screen reader (moves, pastes, a save), and a refusal's reason under Layers (a status of its own)
  const [said, setSaid] = useState("");
  const say = (text: string) => setSaid((s) => (s === text ? `${text} ` : text));
  const [why, setWhy] = useState<string | null>(null);
  useEffect(() => setWhy(null), [p.active.key]);
  const [canPaste, setCanPaste] = useState(() => clipboard() !== null);
  const [canPasteStyle, setCanPasteStyle] = useState(() => styleClipboard() !== null);
  const [tile, setTile] = useState<BlockType | null>(null);

  // hide and lock (G25): the editor's own, per open recipe, following their blocks through each edit; never in the recipe
  // (kept across a reload in this browser's storage, Phase 4: what was kept is read once, and each change is written back)
  const [allFlags, setAllFlags] = useState<Readonly<Record<string, EditorFlags>>>({});
  const [keptBefore] = useState(loadFlags);
  const kept = allFlags[p.active.key] ?? (keptBefore[p.active.key] && flagsOn(keptBefore[p.active.key], recipe));
  const flags = kept ? followFlags(kept, recipe) : { recipe, hidden: [], locked: [] };
  useEffect(() => {
    // (flags read from storage join the state on first use, so they follow their blocks from then on)
    if (kept && (flags !== kept || !allFlags[p.active.key])) setAllFlags((all) => ({ ...all, [p.active.key]: flags }));
  }, [flags]);
  useEffect(() => saveFlags({ ...keptBefore, ...allFlags }), [allFlags]);
  /** The eye or the lock of a row: on the selection when the row is in it, else on that block. */
  const setFlag = (flag: EditorFlag, at: number[], on: boolean) => {
    const list = topLevel(selected.some((x) => keyOf(x) === keyOf(at)) ? selected : [at]);
    setAllFlags((all) => ({ ...all, [p.active.key]: { ...flags, [flag]: setKeys(flags[flag], list, on) } }));
    say(`${flag === "hidden" ? (on ? "Hidden on the stage" : "Shown on the stage") : on ? "Locked" : "Unlocked"}: ${what(list)}`);
  };
  /** The Header row picked (G37). */
  const pickHeader = () => {
    setSelection([[]]);
    setHeader(true);
    setTab("block");
  };

  // what a delete left unused (G34): offered for removal until the next edit
  const [offer, setOffer] = useState<{ options: RecipeOption[]; base: Recipe } | null>(null);
  const offerCleanUp = (before: Recipe, after: Recipe) => {
    const options = leftUnused(before, after);
    setOffer(options.length ? { options, base: after } : null);
  };
  /** A Block tab edit; a Repeat set to run over devices offers to remove the place list it no longer reads (G34, G38). */
  const onBlockEdit = (r: Recipe) => {
    const after = withFormat(r);
    edit(after);
    if (blockAt(recipe, path)?.type === "repeat") offerCleanUp(recipe, after);
  };
  const offerNames = offer ? offer.options.map((o) => o.label).join(", ") : "";

  // a new Image asks for its picture first (G32): the place it goes waits for the file chooser
  const imageInput = useRef<HTMLInputElement>(null);
  const imageAt = useRef<{ into: number[]; index: number; where: string; background?: boolean } | null>(null);
  const latest = useRef(recipe);
  latest.current = recipe;
  const chooseImage = (into: number[], index: number, where: string, background?: boolean) => {
    imageAt.current = { into, index, where, background };
    imageInput.current?.click();
  };

  // after a command by keyboard the block it left selected keeps the focus in Layers, at its new place (the stage keeps its own)
  const [focusTick, setFocusTick] = useState(0);
  useEffect(() => {
    if (focusTick && document.activeElement !== stageRef.current) document.querySelector<HTMLElement>(`[data-layer="${keyOf(path)}"]`)?.focus();
  }, [focusTick]);
  const refocus = () => setFocusTick((n) => n + 1);

  const firstSensor = Object.keys(live ? liveData : sampleData).find((k) => k.endsWith("_cpu_total")) ?? Object.keys(liveData)[0] ?? "libre.cpu_total";
  const add = (type: (typeof ADD_ORDER)[number], byKey: boolean) => {
    if (type === "image") {
      const { into, index } = landing(recipe, path);
      return chooseImage(into, index, "");
    }
    const r = addBlock(recipe, path, type, firstSensor);
    edit(r.recipe);
    setPath(r.path);
    setTab("block");
    say(`Added ${BLOCK_LABEL[type]}`);
    if (byKey) refocus();
  };
  /** A snippet (G35): its Row where Add puts a block, or why it can't go there. */
  const addSnip = (id: SnippetId, byKey: boolean) => {
    const r = addSnippet(recipe, path, id, firstSensor);
    if ("why" in r) return refuse(r.why);
    setWhy(null);
    edit(r.recipe);
    setPath(r.path);
    setTab("block");
    say(`Added ${SNIPPETS.find((s) => s.id === id)!.label}`);
    if (byKey) refocus();
  };
  /**
   * A tile dropped on Layers or the stage: the new block at that place, unless the validator would refuse it there. `background`: dropped
   * on a container's background slot in Layers, it is that container's background layer (one undo step with the add).
   */
  const addAt = (type: BlockType, toParent: number[], index: number, where: string, background?: boolean) => {
    const refused = addRefusal(recipe, type, toParent) ?? (background && type === "repeat" ? "A Repeat lists items; it can't be a background" : undefined);
    if (refused) return refuse(refused);
    if (type === "image") return chooseImage(toParent, index, ` ${where}`, background);
    const r = addBlockAt(recipe, toParent, index, type, firstSensor);
    const layered = background ? setBackground(r.recipe, [r.path], true) : r.recipe;
    if ("why" in layered) return refuse(layered.why);
    edit(layered);
    setPath(r.path);
    setTab("block");
    say(`Added ${BLOCK_LABEL[type]} ${where}`);
  };
  const moved = (r: { recipe: Recipe; path: number[] }, text: string) => {
    if (r.recipe !== recipe) edit(r.recipe);
    setPath(r.path);
    refocus();
    if (r.recipe !== recipe) say(text);
  };
  const nameAt = (at: Path) => {
    const b = blockAt(recipe, at);
    return b ? layerName(recipe, b) : "the block";
  };
  const what = (list: readonly Path[]) => (list.length === 1 ? nameAt(list[0]) : `${list.length} blocks`);
  function refuse(text: string) {
    setWhy(text);
    say(text);
  }
  /** A layer command on the row `at`: the whole selection when `at` is in it, else that block. */
  const run = (cmd: LayerCommand, at: number[]) => {
    setWhy(null);
    const list = topLevel(selected.some((x) => keyOf(x) === keyOf(at)) ? selected : [at]);
    switch (cmd) {
      case "delete": {
        if (!list.length) return;
        const r = removeBlocks(recipe, list);
        const after = withFormat(r.recipe);
        edit(after);
        offerCleanUp(recipe, after);
        setPath(r.path);
        refocus();
        return say(`Deleted ${what(list)}`);
      }
      case "duplicate": {
        if (!list.length) return;
        const r = duplicateBlocks(recipe, list);
        edit(r.recipe);
        setSelection(r.paths);
        refocus();
        return say(`Duplicated ${what(list)}`);
      }
      case "copy":
      case "cut": {
        const clip = copyOf(recipe, list, p.active.images, p.active.key);
        if (!clip) return;
        setCanPaste(true);
        if (cmd === "copy") {
          setClipboard(clip);
          return say(`Copied ${what(list)}`);
        }
        const r = removeBlocks(recipe, list);
        const after = withFormat(r.recipe);
        setClipboard({ ...clip, cut: after });
        edit(after);
        setPath(r.path);
        refocus();
        return say(`Cut ${what(list)}`);
      }
      case "paste": {
        const clip = clipboard();
        if (!clip) return refuse("Nothing to paste: copy or cut a block first");
        const r = pasteBlocks(recipe, at, clip, p.active.images);
        if ("why" in r) return refuse(r.why);
        // a paste right after a cut in the same recipe is a move: one undo step with the cut
        const amend = !!clip.cut && clip.cut === present && clip.from === p.active.key;
        if (clip.cut) setClipboard({ ...clip, cut: undefined });
        edit(r.recipe, r.images, amend);
        setSelection(r.paths);
        refocus();
        const into = blockAt(r.recipe, r.paths[0].slice(0, -1));
        const added = r.added.length ? `; added the option${r.added.length === 1 ? "" : "s"} ${r.added.join(", ")}` : "";
        return say(`Pasted ${clip.blocks.length === 1 ? layerName(r.recipe, clip.blocks[0]) : `${clip.blocks.length} blocks`} into ${into ? layerName(r.recipe, into) : "the card"}${added}`);
      }
      case "wrap":
      case "wrap-card":
      case "wrap-grid": {
        const type = cmd === "wrap" ? "row" : cmd === "wrap-card" ? "card" : "grid";
        const r = wrapIn(recipe, list, type);
        if ("why" in r) return refuse(r.why);
        edit(r.recipe);
        setPath(r.path);
        refocus();
        return say(`Wrapped ${what(list)} in a ${type}`);
      }
      case "unwrap": {
        if (list.length !== 1) return;
        const r = unwrap(recipe, list[0]);
        if ("why" in r) return refuse(r.why);
        const after = withFormat(r.recipe);
        edit(after);
        offerCleanUp(recipe, after);
        setSelection(r.paths.length ? r.paths : [list[0].slice(0, -1)]);
        refocus();
        return say(`Unwrapped ${nameAt(list[0])}`);
      }
      case "copy-style": {
        const clip = copyStyle(recipe, at);
        if (!clip || !at.length) return;
        setStyleClipboard(clip);
        setCanPasteStyle(true);
        return say(`Copied the style of ${clip.name}`);
      }
      case "paste-style": {
        const clip = styleClipboard();
        if (!clip) return refuse("No style to paste: copy a block's style first");
        const r = pasteStyle(recipe, list, clip);
        if ("why" in r) return refuse(r.why);
        edit(r.recipe);
        return say(`Pasted the style of ${clip.name} onto ${what(list)}${r.skipped.length ? `; it can't take the ${r.skipped.join(", ")}` : ""}`);
      }
      case "background":
      case "foreground": {
        const r = setBackground(recipe, list, cmd === "background");
        if ("why" in r) return refuse(r.why);
        edit(r);
        refocus();
        return say(cmd === "background" ? `${what(list)} set as the background` : `${what(list)} taken out of the background`);
      }
      case "forward":
      case "backward":
      case "front":
      case "back": {
        if (list.length !== 1) return;
        const r = restack(recipe, list[0], cmd);
        if ("why" in r) return refuse(r.why);
        edit(r.recipe);
        setPath(r.path);
        refocus();
        return say(`${nameAt(list[0])} ${cmd === "forward" ? "brought forward" : cmd === "backward" ? "sent backward" : cmd === "front" ? "to the front" : "to the back"}`);
      }
      case "select-parent": {
        if (!at.length) return;
        const up = at.slice(0, -1);
        setPath(up);
        setTab("block");
        refocus();
        return say(`${nameAt(up)} selected`);
      }
      case "select-children": {
        const b = blockAt(recipe, at);
        const kids = b && "children" in b ? b.children.map((_, k) => [...at, k]) : [];
        if (!kids.length) return;
        setSelection(kids, kids[0]);
        setTab("block");
        refocus();
        return say(`${what(kids)} selected`);
      }
      case "up":
      case "down":
        if (!at.length) return;
        return moved(stepBlock(recipe, at, cmd === "up" ? -1 : 1), `Moved ${nameAt(at)} ${cmd}`);
      case "out":
      case "in": {
        const to = keyMove(recipe, at, cmd);
        if ("why" in to) return refuse(to.why);
        return moved(moveBlock(recipe, at, to.toParent, to.index), `Moved ${nameAt(at)} ${cmd === "out" ? "out of" : "into"} ${nameAt(cmd === "out" ? at.slice(0, -1) : to.toParent)}`);
      }
    }
  };
  /** Rows dropped in Layers (`moveBlocks`). */
  const drop = (from: number[][], toParent: number[], index: number) => {
    const r = moveBlocks(recipe, from, toParent, index);
    if ("why" in r) return refuse(r.why);
    if (r.recipe === recipe) return;
    edit(r.recipe);
    setSelection(r.paths);
    say(`Moved ${what(from)} into ${nameAt(toParent)}`);
  };
  /** "Move to" in the layer menu (Phase 4): the row, or the selection when the row is in it, to the end of that container. */
  const moveTo = (at: number[], toParent: number[]) => {
    setWhy(null);
    const target = blockAt(recipe, toParent);
    drop(topLevel(selected.some((x) => keyOf(x) === keyOf(at)) ? selected : [at]), toParent, target && "children" in target ? target.children.length : 0);
    refocus();
  };
  /** Renamed in Layers (F2, double-click, the menu): its name in Layers; emptied, the type's name again. */
  const rename = (at: number[], text: string) => {
    const b = blockAt(recipe, at);
    if (!b || !at.length || text === (b.name ?? (b.type === "repeat" ? "Repeat" : layerName(recipe, b)))) return;
    edit(updateBlock(recipe, at, { name: text ? text.slice(0, 40) : undefined }));
    say(text ? `Renamed to ${text}` : "Name cleared");
  };

  /** Ctrl+S: as the Save button (Save as a copy for a signed recipe), or why not. */
  const saveNow = () => {
    if (p.saving) return;
    if (!line.ok) return say(`Not saved: ${first}`);
    if (chip.text === "Recipe · saved") return say("Saved already");
    (p.onSaveCopy ?? p.onSave)();
  };
  // The builder's keys, taken before the studio's on the window (whose Ctrl+S saves the screen in Edit and whose Ctrl+Z undid the
  // screen's last edit as well, B17): Ctrl+S, undo and redo, and the layer commands on the selection outside a text field.
  const keys = useRef({ p, run, saveNow, path });
  keys.current = { p, run, saveNow, path };
  useEffect(() => {
    const COMMAND: Readonly<Record<string, LayerCommand>> = { d: "duplicate", c: "copy", x: "cut", v: "paste", g: "wrap" };
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.isComposing) return;
      const k = e.key.toLowerCase();
      const overlay = document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]') !== null;
      if (k === "s" && !e.shiftKey) {
        // never the browser's Save page dialog, nor the studio's save of the screen; a field being typed commits (on blur) first
        e.preventDefault();
        if (overlay) return;
        const el = document.activeElement;
        if (el instanceof HTMLElement && el.matches("input, textarea, select")) {
          el.blur();
          setTimeout(() => keys.current.saveNow(), 0);
        } else keys.current.saveNow();
        return;
      }
      const t = e.target as HTMLElement | null;
      if (overlay || t?.closest("input, textarea, select, [contenteditable]")) return;
      if (k === "z" && !e.shiftKey) keys.current.p.onUndo();
      else if ((k === "z" && e.shiftKey) || k === "y") keys.current.p.onRedo();
      else if (COMMAND[k] && !e.shiftKey) {
        // text selected on the page copies as the browser's
        if ((k === "c" || k === "x") && window.getSelection()?.toString()) return;
        keys.current.run(COMMAND[k], keys.current.path);
      } else if (k === "g" && e.shiftKey) keys.current.run("unwrap", keys.current.path);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // a tile dragged over the stage: where it would land, or why not (kept under Layers when the drag ends there)
  const [stageDrop, setStageDrop] = useState<StageDrop | null>(null);
  const stageWhy = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (tile) return;
    if (stageWhy.current) setWhy(stageWhy.current);
    stageWhy.current = undefined;
    setStageDrop(null);
  }, [tile]);
  /**
   * Where a tile or the dragged blocks would land at a point on the stage (`dropAt`): the block under it (a Repeat's item is its
   * Repeat for a move), its box and its parent's direction.
   */
  const dropUnder = (x: number, y: number, carry: Carry): StageDrop | null => {
    const zone = zoneEl();
    const el = document.elementFromPoint(x, y);
    if (!zone || !el || !zone.contains(el)) return null;
    const hit = el.closest<HTMLElement>("[data-recipe-path]");
    const raw = hit ? pathOf(hit.dataset.recipePath!) : [];
    const at = "from" in carry ? dragTarget(recipe, raw) : raw;
    const box = at.length ? zone.querySelector<HTMLElement>(`[data-recipe-path="${keyOf(at)}"]`) : null;
    const across = !!box?.parentElement && getComputedStyle(box.parentElement).flexDirection === "row";
    const r = box?.getBoundingClientRect();
    const f = r ? (across ? (x - r.left) / (r.width || 1) : (y - r.top) / (r.height || 1)) : 1;
    return dropAt(recipe, at, f, across, carry);
  };
  const stageTarget = (e: { clientX: number; clientY: number }): StageDrop | null => (tile ? dropUnder(e.clientX, e.clientY, { tile }) : null);

  // a block dragged on the stage (Phase 1): the blocks it carries and where they would land; one undo step on release, none on Esc
  const [moving, setMoving] = useState<{ from: number[][]; drop: StageDrop | null } | null>(null);
  // a drag just ended on the stage: the click its release makes is no pick
  const dragged = useRef(false);
  const stopDrag = useRef<(() => void) | null>(null);
  useEffect(() => () => stopDrag.current?.(), []);
  const pressStage = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragged.current = false;
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || tile) return;
    const t = e.target as HTMLElement;
    const hit = t.closest<HTMLElement>("[data-recipe-path]");
    if (!hit || t.closest("[data-share-handle]")) return;
    // a locked block (or one in it) stays where it is (G25)
    const at = dragTarget(recipe, pathOf(hit.dataset.recipePath!));
    if (flagged(flags.locked, at)) return;
    const from = selected.some((x) => keyOf(x) === keyOf(at)) ? topLevel(selected) : [at];
    const [x0, y0] = [e.clientX, e.clientY];
    // in a grid with tracks (Phase 5) the selected block, pressed in it, moves a track at a time: the block itself, or the one holding the press
    const areaAt = areaGrid(recipe, at) ? at : path.length && areaGrid(recipe, path) && (keyOf(at) === keyOf(path) || keyOf(at).startsWith(`${keyOf(path)}.`)) && !flagged(flags.locked, path) ? [...path] : null;
    if (areaAt && from.length <= 1) return pressArea(areaAt, x0, y0);
    let started = false;
    let last: StageDrop | null = null;
    stopDrag.current = trackPointer(
      (m) => {
        if (!started && !pastDragThreshold(m.clientX - x0, m.clientY - y0)) return;
        // a block dragged that was not selected is the selection, as a row dragged in Layers
        if (!started && from.length === 1 && keyOf(from[0]) !== keyOf(path)) setPath(from[0]);
        started = true;
        last = dropUnder(m.clientX, m.clientY, { from });
        setMoving({ from, drop: last });
      },
      (cancelled) => {
        stopDrag.current = null;
        if (!started) return;
        dragged.current = true;
        setMoving(null);
        if (cancelled) return say("Move cancelled");
        if (!last) return;
        if (last.why) return refuse(last.why);
        drop(from, last.toParent, last.index);
      },
    );
  };

  /** A block of a grid with tracks dragged by its body: its area follows the pointer's track, shown as it goes, one undo step on release. */
  const pressArea = (at: number[], x0: number, y0: number) => {
    const m = measureArea(zoneEl(), recipe, at);
    if (!m) return;
    const start = areaNow(recipe, at, m.drawn);
    const from = { col: trackAt(x0, m.lines.cols), row: trackAt(y0, m.lines.rows) };
    let started = false;
    let last: ReturnType<typeof dragArea> | null = null;
    stopDrag.current = trackPointer(
      (p) => {
        if (!started && !pastDragThreshold(p.clientX - x0, p.clientY - y0)) return;
        if (!started && keyOf(at) !== keyOf(path)) setPath(at);
        started = true;
        last = dragArea(start, from, { col: trackAt(p.clientX, m.lines.cols), row: trackAt(p.clientY, m.lines.rows) }, m.cols, m.rows);
        setPreview(setArea(recipe, at, last));
      },
      (cancelled) => {
        stopDrag.current = null;
        if (!started) return;
        dragged.current = true;
        if (cancelled || !last) {
          setPreview(null);
          return say("Move cancelled");
        }
        edit(setArea(recipe, at, last));
        say(`Moved ${nameAt(at)} to column ${last.col}, row ${last.row}`);
      },
    );
  };

  // F2 on the stage renames in Layers
  const [renameAt, setRenameAt] = useState<{ key: string } | null>(null);

  // the layer menu on the stage (Phase 2): right-click, Shift+F10 or the Menu key, Layers' rows on the block it opened on
  const [stageMenu, setStageMenu] = useState<{ x: number; y: number; at: number[] } | null>(null);
  const openStageMenu = (at: number[], x: number, y: number) => {
    if (!selected.some((s) => keyOf(s) === keyOf(at)) || header) select(at, "only");
    setStageMenu({ x, y, at });
  };
  const stageEntries = (at: number[]) => {
    const b = blockAt(recipe, at);
    const list = topLevel(selected.some((s) => keyOf(s) === keyOf(at)) ? selected : [at]);
    return layerEntries({
      at,
      many: list.length,
      container: !!b && "children" in b,
      hidden: flags.hidden.includes(keyOf(at)),
      locked: flags.locked.includes(keyOf(at)),
      canPaste,
      canPasteStyle,
      hasChildren: !!b && "children" in b && b.children.length > 0,
      background: !!b?.background,
      targets: moveTargets(recipe, list),
      onCommand: run,
      onMoveTo: moveTo,
      onRename: (x) => setRenameAt({ key: keyOf(x) }),
      onFlag: setFlag,
    });
  };

  /** The focused stage's keys (Phase 1): the arrows walk the blocks as in Layers, Alt+arrows move the selection, Del, F2 and Esc. */
  const onStageKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.ctrlKey || e.metaKey) return;
    if ((e.shiftKey && e.key === "F10" && !e.altKey) || e.key === "ContextMenu") {
      e.preventDefault();
      const zone = zoneEl();
      const r = (path.length ? zone?.querySelector<HTMLElement>(`[data-recipe-path="${keyOf(path)}"]`) : zone)?.getBoundingClientRect();
      return openStageMenu(path, r ? r.left + 12 : e.currentTarget.getBoundingClientRect().left + 24, r ? r.top + 12 : e.currentTarget.getBoundingClientRect().top + 24);
    }
    const move = ({ ArrowUp: "up", ArrowDown: "down", ArrowLeft: "out", ArrowRight: "in" } as const)[e.key as "ArrowUp"];
    // a block of a grid with tracks (Phase 5): Alt+arrows move it a track, Alt+Shift+arrows size it by a track
    if (e.altKey && move && areaGrid(recipe, path) && !flagged(flags.locked, path)) {
      e.preventDefault();
      const delta = { cols: e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0, rows: e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0 };
      const drawn = measureArea(zoneEl(), recipe, path)?.drawn;
      const r = e.shiftKey ? stepAreaSize(recipe, path, delta, drawn) : nudgeArea(recipe, path, delta, drawn);
      if ("why" in r) return refuse(r.why);
      edit(r);
      return say(`${nameAt(path)}: ${e.shiftKey ? "sized" : "moved"} a track`);
    }
    if (e.altKey && move) {
      e.preventDefault();
      if (path.length) run(move, path);
      return;
    }
    if (e.altKey || e.shiftKey) return;
    if (move) {
      e.preventDefault();
      const next = stageStep(recipe, path, e.key);
      if (!next) return;
      setPath(next);
      setTab("block");
      say(`${nameAt(next)} selected`);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      if (path.length) run("delete", path);
    } else if (e.key === "F2" && path.length) {
      e.preventDefault();
      setRenameAt({ key: keyOf(path) });
    } else if (e.key === "Escape" && (path.length || header)) {
      // up one level: the block holding the selection
      e.preventDefault();
      setPath(header ? [] : path.slice(0, -1));
    }
  };

  const pickPreset = (id: string) => {
    const x = recipe.presets.find((q) => q.id === id);
    setPreset(id);
    setInRail(x?.size === "rail");
    if (x && x.size !== "rail") setSize(x.size);
  };
  /** A picture picked for a new Image (G32): the block goes where the tile was clicked or dropped, with its picture. */
  const onNewImage = (file: File) => {
    const at = imageAt.current;
    imageAt.current = null;
    if (!at) return;
    void file.arrayBuffer().then((buf) => {
      const r = addImageAt(latest.current, p.active.images, at.into, at.index, { path: imagePath(file.name, file.type), bytes: new Uint8Array(buf) });
      if ("why" in r) return refuse(r.why);
      const layered = at.background ? setBackground(r.recipe, [r.path], true) : r.recipe;
      if ("why" in layered) return refuse(layered.why);
      edit(layered, r.images);
      setPath(r.path);
      setTab("block");
      say(`Added Image${at.where}`);
    });
  };
  const onImage = (file: File) => {
    void file.arrayBuffer().then((buf) => {
      const path2 = imagePath(file.name, file.type);
      const images = [...p.active.images.filter((f) => f.path !== path2), { path: path2, bytes: new Uint8Array(buf) }];
      // the picture it showed stays in the open recipe for an undo; a save packs only the ones shown (`packedImages`, B22)
      edit(blockAt(recipe, path)?.type === "image" ? updateBlock(recipe, path, { file: path2 }) : recipe, images);
    });
  };
  const { w, h } = zonePx(size);
  const zoneEl = () => zoneHost.current?.querySelector<HTMLElement>("[data-recipe-zone]") ?? null;
  useEffect(() => {
    let frame = 0;
    // after the card has measured itself (its blocks are sized from its box) and its labels have fitted their text
    const timer = setTimeout(() => {
      frame = requestAnimationFrame(() => {
        const zone = zoneEl();
        const m = zone && measureInks(zone);
        const next = m ? crowding(m.inks, m.card) : [];
        setCrowds((old) => (old && JSON.stringify(old) === JSON.stringify(next) ? old : next));
        const steps: Record<string, number> = {};
        for (const el of zone?.querySelectorAll<HTMLElement>("[data-recipe-opacity]") ?? []) {
          const key = el.closest<HTMLElement>("[data-recipe-path]")?.dataset.recipePath;
          if (key !== undefined) steps[key] = Math.max(steps[key] ?? 0, Number(el.dataset.recipeOpacity));
        }
        setDrawn((old) => (JSON.stringify(old) === JSON.stringify(steps) ? old : steps));
      });
    }, 120);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [recipe, size.join("x"), live, lookId, preset, stageBox, data]);
  const fits = line.ok && crowds !== null && !warnings.length && recipe.root.children.length > 0;
  const shown = `${size[0]}×${size[1]}`;
  /** "Other" sizes (G17): a side typed in the stage's boxes, 1 to 12 whatever the recipe's range (B30: outside it, a warning says so). */
  const setSide = (k: 0 | 1, v: number | undefined) => {
    setInRail(false);
    setSize(stageCells(k === 0 ? [v ?? size[0], size[1]] : [size[0], v ?? size[1]], size));
  };
  const outside = railShown ? undefined : outsideRange(recipe, size);
  // "Check every size" (Phase 3): its findings hold for the recipe and the view they were measured on; an edit or another view drops them
  const view = [recipe, live, lookId, preset] as const;
  const [check, setCheck] = useState<{ view: typeof view; spans: Cells[]; done: number; found?: SpanResult[] } | null>(null);
  const checkNow = check?.view.every((x, k) => x === view[k]) ? check : null;
  const checking = !!checkNow && !checkNow.found;
  const sizeFindings = checkNow?.found?.flatMap((s) => s.issues.map((issue) => ({ cells: s.cells, issue })));

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-ui-app font-ui">
      <PageBar>
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1">
          <button type="button" onClick={p.onBack} className="h-8 rounded-ui-sm px-1.5 text-body text-ui-3 hover:text-ui-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent">
            Widgets
          </button>
          <ChevronRight className="h-4 w-4 shrink-0 text-ui-hint" aria-hidden />
          <label className="relative flex min-w-0 items-center">
            <input
              aria-label="Widget name"
              value={name ?? recipe.name}
              onFocus={() => setName(recipe.name)}
              onChange={(e) => setName(e.target.value.slice(0, 60))}
              onBlur={() => {
                const next = name?.trim();
                if (next && next !== recipe.name) edit({ ...recipe, name: next, root: recipe.root.title === recipe.name ? { ...recipe.root, title: next } : recipe.root });
                setName(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              className="h-8 w-[190px] min-w-0 rounded-ui-sm border border-transparent bg-transparent pl-1.5 pr-7 text-title font-medium text-ui-1 outline-none hover:border-ui-strong focus:border-ui-accent"
            />
            <Pencil className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-ui-hint" aria-hidden />
          </label>
        </nav>
        <StatusChip tone={chip.tone} dot={false} className="border border-ui-strong bg-transparent">
          {chip.text}
        </StatusChip>
        {p.active.stored && chip.text === "Unsaved changes" && (
          <Button variant="ghost" small icon={<RotateCcw strokeWidth={1.5} />} onClick={p.onDiscard} title={`Back to the saved ${p.active.stored.version}`}>
            Discard changes
          </Button>
        )}
        {/* one line however many are open (B18): it scrolls sideways, each name cut to its room, rather than wrap over the page */}
        {p.drafts.length > 1 && (
          <Segmented
            label="Open recipes"
            size="bar"
            className="min-w-0 shrink flex-nowrap overflow-x-auto"
            value={p.active.key}
            options={p.drafts.map((d) => ({ value: d.key, label: <span className="block max-w-[140px] truncate">{d.history.present.name.split(" · ")[0]}</span> }))}
            onChange={p.onActive}
          />
        )}
        <IconButton label={`Close ${recipe.name}`} size={32} onClick={p.onClose}>
          <X className="h-4 w-4" />
        </IconButton>
        <BarFill />
        <IconButton label="Undo (Ctrl+Z)" size={32} disabled={!p.active.history.past.length} onClick={p.onUndo}>
          <Undo2 className="h-4 w-4" />
        </IconButton>
        <IconButton label="Redo (Ctrl+Shift+Z)" size={32} disabled={!p.active.history.future.length} onClick={p.onRedo}>
          <Redo2 className="h-4 w-4" />
        </IconButton>
        <span aria-hidden className="h-5 w-px bg-ui-subtle" />
        <Button variant="ghost" icon={<Upload strokeWidth={1.5} />} onClick={p.onExport} disabled={p.saving || !line.ok} title={line.ok ? "Saves it, then writes the package file" : first}>
          Export
        </Button>
        {p.onSaveCopy ? (
          <Button icon={<Save strokeWidth={1.5} />} onClick={p.onSaveCopy} disabled={p.saving || !line.ok || chip.text === "Recipe · saved"} title={line.ok ? "It is signed: only its publisher's key may replace it, so the edit is saved as a new recipe" : first}>
            Save as a copy
          </Button>
        ) : (
          <Button icon={<Save strokeWidth={1.5} />} onClick={p.onSave} disabled={p.saving || !line.ok || chip.text === "Recipe · saved"} title={line.ok ? undefined : first}>
            Save
          </Button>
        )}
        <Button variant="primary" icon={<MonitorUp strokeWidth={1.5} />} onClick={() => p.onAddToScreen(preset)} disabled={p.saving || !line.ok} title={line.ok ? "Saves it, then adds it to the screen in Edit" : first}>
          Add to a screen
        </Button>
      </PageBar>
      {p.prompt}
      <p aria-live="polite" aria-atomic="true" data-announce="" className="sr-only">
        {said}
      </p>
      <div className="flex min-h-0 flex-1">
        <aside aria-label="Layers and blocks" className="flex w-[256px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-ui-subtle bg-ui-chrome p-3">
          <div>
            <h2 className="mb-2 px-2 text-caption text-ui-3">Layers</h2>
            <Layers
              recipe={recipe}
              path={path}
              selected={selected}
              problems={problemMap}
              tile={tile}
              canPaste={canPaste}
              canPasteStyle={canPasteStyle}
              onSelect={select}
              onRename={rename}
              onCommand={run}
              onMove={drop}
              onMoveTo={moveTo}
              onAdd={(type, toParent, index, background) => addAt(type, toParent, index, background ? `as the background of ${nameAt(toParent)}` : `into ${nameAt(toParent)}`, background)}
              onWhy={setWhy}
              hidden={flags.hidden}
              locked={flags.locked}
              onFlag={setFlag}
              header={header}
              onHeader={pickHeader}
              renameAt={renameAt}
            />
            {why && (
              <p role="status" data-move-why="" className="mt-1 px-2 text-micro leading-snug text-ui-warn">
                {why}
              </p>
            )}
            {offer && offer.base === present && (
              <div role="status" data-clean-up="" className="mt-1 flex flex-col items-start gap-1.5 rounded-ui-md border border-ui-subtle bg-ui-raised px-2 py-1.5 text-micro leading-snug text-ui-2">
                <span>Not used by a block now: {offerNames}</span>
                <span className="flex gap-1.5">
                  <Button
                    small
                    onClick={() => {
                      // one undo step with the delete that left them
                      edit(cleanUp(present, offer.options), undefined, true);
                      setOffer(null);
                      say(`Removed ${offerNames}`);
                    }}
                  >
                    Also remove {offerNames} (not used now)
                  </Button>
                  <Button small variant="ghost" onClick={() => setOffer(null)}>
                    Keep
                  </Button>
                </span>
              </div>
            )}
          </div>
          <div>
            <h2 className="mb-2 px-2 text-caption text-ui-3">Add a block</h2>
            <p className="mb-2 px-2 text-micro text-ui-3">Click to add by the selection, or drag onto Layers or the widget</p>
            <div className="grid grid-cols-3 gap-1.5">
              {ADD_ORDER.map((type) => (
                <button
                  key={type}
                  type="button"
                  draggable
                  onClick={(e) => add(type, e.detail === 0)}
                  onDragStart={(e) => {
                    setTile(type);
                    setWhy(null);
                    e.dataTransfer.setData("text/plain", `recipe-block:${type}`);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onDragEnd={() => setTile(null)}
                  data-add-block={type}
                  className="flex h-[60px] flex-col items-center justify-center gap-1.5 rounded-ui-md border border-ui-subtle bg-ui-panel text-micro text-ui-2 hover:border-ui-strong hover:text-ui-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent"
                >
                  <BlockIcon type={type} />
                  {BLOCK_LABEL[type]}
                </button>
              ))}
            </div>
            <input
              ref={imageInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-label="Picture for the new Image"
              tabIndex={-1}
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) onNewImage(file);
                else imageAt.current = null;
              }}
            />
          </div>
          <div>
            <h2 className="mb-2 px-2 text-caption text-ui-3">Snippets</h2>
            <p className="mb-2 px-2 text-micro text-ui-3">A few blocks in a Row, added by the selection</p>
            <div className="flex flex-col gap-1.5">
              {SNIPPETS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={(e) => addSnip(s.id, e.detail === 0)}
                  data-add-snippet={s.id}
                  className="flex h-9 items-center gap-2 rounded-ui-md border border-ui-subtle bg-ui-panel px-2.5 text-left text-micro text-ui-2 hover:border-ui-strong hover:text-ui-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent"
                >
                  <BlockIcon type="row" />
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </aside>
        <main className="flex min-w-0 flex-1 flex-col gap-3 p-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-body text-ui-3">Size</span>
            <Segmented
              label="Size"
              size="bar"
              value={railShown ? "rail" : `${size[0]}x${size[1]}`}
              options={[...sizes.map((c) => ({ value: `${c[0]}x${c[1]}`, label: `${c[0]}×${c[1]}` })), ...(hasRail ? [{ value: "rail", label: "Rail" }] : [])]}
              onChange={(v) => {
                setInRail(v === "rail");
                if (v !== "rail") setSize(v.split("x").map(Number) as Cells);
              }}
            />
            <span className="flex items-center gap-1 text-body text-ui-3" title={`Any size from 1×1 to ${CELLS_MAX}×${CELLS_MAX}; the recipe allows ${recipe.size.min.join("×")} to ${recipe.size.max.join("×")}`}>
              <NumberInput label="Stage columns" value={size[0]} min={1} max={CELLS_MAX} onChange={(v) => setSide(0, v)} width={52} />
              ×
              <NumberInput label="Stage rows" value={size[1]} min={1} max={CELLS_MAX} onChange={(v) => setSide(1, v)} width={52} />
            </span>
            {outside && (
              <span role="status" data-stage-outside={outside} className="flex items-center gap-1 text-caption text-ui-warn">
                <CircleAlert className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
                {outside === "under" ? `Under its Smallest (${recipe.size.min.join("×")}): Edit won't size it this small` : `Past its Largest (${recipe.size.max.join("×")}): Edit warns at this size`}
              </span>
            )}
            <Button
              small
              variant="ghost"
              disabled={checking}
              onClick={() => {
                const spans = spansOf(recipe);
                setCheck({ view, spans, done: 0 });
                say(`Checking ${spans.length} sizes`);
              }}
              title={`Draws it at every size from ${recipe.size.min.join("×")} to ${recipe.size.max.join("×")} and lists what is cut, crowded or under the text floor`}
            >
              {checkNow && checking ? `Checking ${checkNow.done} of ${checkNow.spans.length}…` : "Check every size"}
            </Button>
            <span className="ml-3 text-body text-ui-3">Preview in</span>
            <select aria-label="Preview in" value={lookId} onChange={(e) => setLookId(e.target.value)} className="h-8 rounded-ui-md border border-ui-strong bg-ui-raised px-2.5 text-body font-medium text-ui-1 outline-none focus:border-ui-accent">
              {LOOKS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
            <span className="ml-auto" />
            <Segmented label="Data" size="bar" value={live ? "live" : "sample"} options={[{ value: "live", label: <span className="flex items-center gap-1.5"><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-ui-ok" />Live data</span> }, { value: "sample", label: "Sample" }]} onChange={(v) => setLive(v === "live")} />
          </div>
          {/* a group with a roving outline (the selection), not an application (B1 Q4): the arrows walk, Alt+arrows move */}
          <div
            ref={stageRef}
            role="group"
            aria-label="Widget preview"
            aria-roledescription="stage"
            aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight Delete F2 Escape"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: the stage takes focus so its keys (walk, move, Del, F2, Esc) reach it
            tabIndex={0}
            data-builder-stage=""
            data-moving={moving ? "" : undefined}
            onPointerDown={pressStage}
            onKeyDown={onStageKey}
            onContextMenu={(e) => {
              const t = e.target as HTMLElement;
              const hit = t.closest<HTMLElement>("[data-recipe-path]");
              if (!hit && !t.closest("[data-recipe-zone]")) return;
              e.preventDefault();
              // a locked block's menu is its container's, as its click picks that (G25)
              openStageMenu(hit ? stagePick(flags.locked, pathOf(hit.dataset.recipePath!)) : [], e.clientX, e.clientY);
            }}
            onClick={(e) => {
              if (dragged.current) {
                dragged.current = false;
                return;
              }
              const target = e.target as HTMLElement;
              if (target.closest("[data-share-handle]")) return;
              const hit = target.closest<HTMLElement>("[data-recipe-path]");
              if (hit) {
                // a locked block is not picked here: the block holding it is (G25); Ctrl adds or takes away, Shift picks a range
                select(stagePick(flags.locked, pathOf(hit.dataset.recipePath!)), e.shiftKey ? "range" : e.ctrlKey || e.metaKey ? "toggle" : "only");
              } else if (target.closest("[data-recipe-zone] [data-part='header']")) pickHeader();
              else if (target.closest("[data-recipe-zone]")) setPath([]);
            }}
            // a tile from "Add a block" dropped onto the widget (G12)
            onDragOver={(e) => {
              const d = stageTarget(e);
              stageWhy.current = d?.why;
              setStageDrop(d);
              if (!d) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = d.why ? "none" : "copy";
            }}
            onDragLeave={(e) => {
              // left for good: to a place outside (a drag's leave often names no place: then only the box's own leave counts)
              if (e.relatedTarget ? e.currentTarget.contains(e.relatedTarget as Node) : e.target !== e.currentTarget) return;
              stageWhy.current = undefined;
              setStageDrop(null);
            }}
            onDrop={(e) => {
              const d = stageTarget(e);
              stageWhy.current = undefined;
              setStageDrop(null);
              if (!d || !tile) return;
              e.preventDefault();
              addAt(tile, d.toParent, d.index, d.text);
            }}
            className="relative flex min-h-0 flex-1 select-none items-center justify-center overflow-hidden rounded-ui-lg border border-ui-subtle outline-none focus-visible:border-ui-accent"
            style={{ backgroundImage: "radial-gradient(color-mix(in oklab, var(--ui-text-hint) 30%, transparent) 1px, transparent 1px)", backgroundSize: "16px 16px" }}
          >
            {flags.hidden.length > 0 && <style data-hidden-blocks="">{hiddenRule(flags.hidden)}</style>}
            {moving && <style data-moving-blocks="">{moving.from.map((x) => `[data-builder-stage] [data-recipe-path="${keyOf(x)}"]{opacity:.45}`).join("\n")}</style>}
            <div ref={zoneHost}>
              <RecipePreview
                recipe={live ? recipe : sampled}
                images={p.active.images}
                values={shownValues}
                cells={size}
                rail={railShown}
                sample={!live}
                appearance={p.appearance}
                pageStyle={p.pageStyle}
                lookId={lookId}
                fit={{ w: Math.max(100, stageBox.w - 96), h: Math.max(80, stageBox.h - 96) }}
                maxScale={Math.min(1.6, 560 / w, 420 / h) > 1 ? Math.min(1.6, 560 / w, 420 / h) : 1}
                overlay={
                  <>
                    {also.map((x) => blockAt(recipe, x) && <Selection key={keyOf(x)} zone={zoneEl()} path={x} recipe={recipe} tick={[recipe, size, live, lookId, preset, stageBox, data]} also />)}
                    <Selection zone={zoneEl()} path={path} recipe={recipe} tick={[recipe, size, live, lookId, preset, stageBox, data]} />
                    {!moving && !tile && selected.length === 1 && !header && <ShareHandles zone={zoneEl()} recipe={recipe} path={path} locked={flags.locked} tick={[recipe, size, live, lookId, preset, stageBox, data]} onLive={setPreview} onDone={(r, text) => {
                          edit(r);
                          say(text);
                        }} />}
                    {!moving && !tile && selected.length === 1 && !header && (
                      <>
                        <AreaHandles zone={zoneEl()} recipe={recipe} path={path} locked={flags.locked} tick={[recipe, size, live, lookId, preset, stageBox, data]} onLive={setPreview} onDone={(r, text) => {
                          edit(r);
                          say(text);
                        }} />
                        <FillHandles zone={zoneEl()} recipe={recipe} path={path} locked={flags.locked} tick={[recipe, size, live, lookId, preset, stageBox, data]} onLive={setPreview} onDone={(r, text) => {
                          edit(r);
                          say(text);
                        }} />
                      </>
                    )}
                    {(stageDrop ?? moving?.drop) && <DropMark zone={zoneEl()} drop={(stageDrop ?? moving?.drop)!} verb={moving ? "Move" : "Add"} tick={[recipe, size, stageBox]} />}
                  </>
                }
              />
            </div>
          </div>
          <div role="status" data-validation="" className="flex items-center gap-2 text-caption">
            {line.ok && !warnings.length && !cautions.length ? <CircleCheck className="h-4 w-4 shrink-0 text-ui-ok" strokeWidth={1.5} aria-hidden /> : <CircleAlert className="h-4 w-4 shrink-0 text-ui-warn" strokeWidth={1.5} aria-hidden />}
            {!listed.length ? (
              <span className="text-ui-2">
                {line.summary}
                {fits && <span data-fits=""> · fits at {shown}</span>}
              </span>
            ) : listed.length === 1 ? (
              <button type="button" data-problem="0" data-warning={listed[0].warn ? "" : undefined} onClick={() => goTo(listed[0])} className="min-w-0 truncate text-left text-ui-2 underline-offset-2 hover:text-ui-1 hover:underline">
                {listed[0].text}
              </button>
            ) : (
              <span className="text-ui-2">{[problems.length && `${problems.length} problem${problems.length === 1 ? "" : "s"}`, cautions.length && `${cautions.length} warning${cautions.length === 1 ? "" : "s"}`, warnings.length && `${warnings.length} warning${warnings.length === 1 ? "" : "s"} at ${shown}`].filter(Boolean).join(", ")}</span>
            )}
            <span className={cn("ml-auto shrink-0", floorIssue ? "text-ui-warn" : "text-ui-3")}>{floorIssue ? plainIssue(recipe, floorIssue).text : line.floor}</span>
          </div>
          {listed.length > 1 && (
            <ul aria-label="Problems" data-problems="" className="-mt-1 flex max-h-[30%] shrink-0 flex-col gap-0.5 overflow-y-auto text-caption">
              {listed.map((x, k) => (
                <li key={`${k} ${x.text}`}>
                  <button type="button" data-problem={k} data-warning={x.warn ? "" : undefined} onClick={() => goTo(x)} className={cn("w-full truncate rounded-ui-sm px-6 py-0.5 text-left hover:bg-ui-raised hover:text-ui-1", x.warn ? "text-ui-3" : "text-ui-2")}>
                    {x.text}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {checkNow?.found && sizeFindings && (
            <section aria-label="Every size" data-size-check="" className="-mt-1 flex max-h-[30%] shrink-0 flex-col gap-0.5 text-caption">
              <div className="flex items-center gap-2">
                {sizeFindings.length ? <CircleAlert className="h-4 w-4 shrink-0 text-ui-warn" strokeWidth={1.5} aria-hidden /> : <CircleCheck className="h-4 w-4 shrink-0 text-ui-ok" strokeWidth={1.5} aria-hidden />}
                <span role="status" data-size-check-summary="" className="text-ui-2">
                  {sizeFindings.length
                    ? `${checkNow.found.length} of ${checkNow.spans.length} sizes have problems`
                    : `Checked ${checkNow.spans.length} size${checkNow.spans.length === 1 ? "" : "s"}, from ${recipe.size.min.join("×")} to ${recipe.size.max.join("×")}: all fit`}
                </span>
                <IconButton label="Close the size check" size={26} className="ml-auto" onClick={() => setCheck(null)}>
                  <X className="h-3.5 w-3.5" />
                </IconButton>
              </div>
              {sizeFindings.length > 0 && (
                <ul aria-label="Problems at every size" className="flex flex-col gap-0.5 overflow-y-auto">
                  {sizeFindings.map((x, k) => (
                    <li key={`${k} ${x.issue.text}`}>
                      <button
                        type="button"
                        data-size-problem={x.cells.join("x")}
                        onClick={() => {
                          // the stage at that size, the block picked
                          setInRail(false);
                          setSize(x.cells);
                          goTo(x.issue);
                        }}
                        className="w-full truncate rounded-ui-sm px-6 py-0.5 text-left text-ui-2 hover:bg-ui-raised hover:text-ui-1"
                      >
                        {x.issue.text}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          {checkNow && checking && (
            <SizeCheckRun
              recipe={live ? recipe : sampled}
              named={recipe}
              spans={checkNow.spans}
              values={shownValues}
              sample={!live}
              appearance={p.appearance}
              pageStyle={p.pageStyle}
              lookId={lookId}
              images={p.active.images}
              onProgress={(done) => setCheck((c) => c && { ...c, done })}
              onDone={(found) => {
                setCheck((c) => c && { ...c, found });
                say(found.length ? `${found.length} of ${checkNow.spans.length} sizes have problems` : `Every size fits`);
              }}
            />
          )}
        </main>
        <aside aria-label="Inspector" className="flex w-[320px] shrink-0 flex-col overflow-y-auto border-l border-ui-subtle bg-ui-chrome">
          <Tabs
            label="Inspector"
            className="sticky top-0 z-10 bg-ui-chrome px-4"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: "block", label: "Block" },
              { value: "options", label: "Options" },
              { value: "presets", label: "Presets" },
            ]}
          />
          {tab === "block" && selected.length > 1 && (
            <p data-multi="" className="mx-4 mt-3 rounded-ui-md bg-ui-raised px-3 py-2 text-caption text-ui-2">
              {selected.length} blocks selected: Delete, Duplicate, Copy, Cut, Paste style and Wrap act on all, and so do the shared fields below.
            </p>
          )}
          <TypingContext.Provider value={typing}>
            {/* several blocks (Phase 6): the fields they share, each one undo step for all of them */}
            {tab === "block" && topLevel(selected).length > 1 && (
              <MultiInspector
                recipe={recipe}
                paths={topLevel(selected)}
                primary={path}
                onChange={(r, text) => {
                  edit(r);
                  say(text);
                }}
                onWhy={refuse}
              />
            )}
            {tab === "block" && topLevel(selected).length <= 1 && <BlockTab recipe={recipe} path={path} header={header} onChange={onBlockEdit} onRemove={() => run("delete", path)} onDuplicate={() => run("duplicate", path)} data={data} names={live ? names : undefined} devices={devices} onOpenSources={p.onOpenSources} onImage={onImage} nextVersion={p.active.stored?.version === recipe.version ? nextVersion(recipe.version) : recipe.version} drawnOpacity={drawn[path.join(".")]} />}
            {tab === "options" && <OptionsTab recipe={recipe} onChange={(r) => edit(r)} data={{ ...sampleData, ...liveData }} onOpenSources={p.onOpenSources} />}
            {tab === "presets" && <PresetsTab recipe={recipe} onChange={(r) => edit(r)} current={preset} onPick={pickPreset} values={shownValues} size={size} data={{ ...sampleData, ...liveData }} devices={devices} onOpenSources={p.onOpenSources} />}
          </TypingContext.Provider>
        </aside>
      </div>
      {stageMenu && <ContextMenu x={stageMenu.x} y={stageMenu.y} width={230} testId="builder-stage-menu" entries={stageEntries(stageMenu.at)} onClose={() => setStageMenu(null)} />}
    </div>
  );
}

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
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from "react";
import { ChevronRight, CircleAlert, CircleCheck, MonitorUp, Pencil, Redo2, RotateCcw, Save, Undo2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Segmented } from "@/components/ui/segmented";
import { StatusChip } from "@/components/ui/status-chip";
import { Tabs } from "@/components/ui/tabs";
import { BarFill, PageBar } from "@/components/studio/page-bar";
import { useSensors } from "@/hooks/useSensors";
import { withHwinfoAliases } from "@/lib/hwinfo-aliases";
import type { Appearance } from "@/lib/style-resolve";
import { skinLabel } from "@/lib/theme-skins";
import { cn } from "@/lib/utils";
import { GALLERY_IDS } from "@/components/studio/look-gallery-model";
import { SAMPLE_THEMES } from "@/looks/sample-themes";
import type { Data } from "@/widgets/core/types";
import type { BlockType, Cells, PackageFile, Recipe } from "@/widgets/recipe/types";
import { toFlat, toNames } from "@/widgets/shared/data-adapter";
import { ADD_ORDER, addBlock, addBlockAt, addRefusal, BLOCK_LABEL, blockAt, clampCells, devicesIn, draftSample, duplicateBlocks, flatten, keyMove, layerName, moveBlock, moveBlocks, nextVersion, presetValues, rangeOf, recipeIssues, removeBlocks, stepBlock, topLevel, updateBlock, validationLine, withFormat, wrapInRow, type Path } from "./builder-model";
import { BlockIcon } from "./block-icons";
import { BlockTab } from "./block-tab";
import { clipboard, copyOf, pasteBlocks, setClipboard } from "./clipboard";
import { type Crowd, crowdIssues, crowding, measureInks } from "./crowding";
import { NumberInput, type Typing, TypingContext } from "./fields";
import type { History } from "./history";
import { type LayerCommand, Layers, type SelectHow } from "./layers";
import { OptionsTab } from "./options-tab";
import { type PlainIssue, plainIssue, plainIssues } from "./plain-issues";
import { PresetsTab } from "./presets-tab";
import { RecipePreview, zonePx } from "./recipe-preview";
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
  const all = [recipe.size.min, recipe.size.default, ...recipe.presets.map((p) => p.size), recipe.size.max, ...(shown ? [shown] : [])];
  const seen = new Map(all.map((c) => [`${c[0]}x${c[1]}`, c] as const));
  return [...seen.values()].sort((a, b) => a[0] * a[1] - b[0] * b[1] || a[0] - b[0]).slice(0, 6);
}

/** The draft's state line: what saving means now. */
function savedChip(d: Draft): { text: string; tone: "neutral" | "warn" } {
  if (!d.stored) return { text: "Not saved yet", tone: "warn" };
  return isUnsaved(d) ? { text: "Unsaved changes", tone: "warn" } : { text: "Recipe · saved", tone: "neutral" };
}

/** The selected block's box on the stage, in the zone's own px, with its name over it. */
/** The room the selection's name tag takes beside its block, in the zone's px (11 px text, its padding and gap). */
const TAG_ROOM = 24;

/**
 * Where the selection's name tag goes: under the block where there is room above `floor` (the weather credit line's top, else the
 * zone's bottom), else over the block, else inside its top corner. Never over the credit line (B12), which sits right under a Repeat
 * that fills the card.
 */
export const tagPlace = (box: { y: number; h: number }, floor: number): "under" | "over" | "inside" => (floor - (box.y + box.h) >= TAG_ROOM ? "under" : box.y >= TAG_ROOM ? "over" : "inside");
const TAG_CLASS = { under: "left-0 top-full mt-1", over: "left-0 bottom-full mb-1", inside: "left-1 top-1" } as const;

function Selection({ zone, path, recipe, tick }: { zone: HTMLElement | null; path: Path; recipe: Recipe; tick: unknown }) {
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
  return (
    <div aria-hidden className="pointer-events-none absolute z-10" style={{ left: box.x - 3, top: box.y - 3, width: box.w + 6, height: box.h + 6 }}>
      <div className="h-full w-full rounded-[6px] border-2 border-ui-accent" />
      <span data-selection-tag="" className={`absolute ${tag} whitespace-nowrap rounded-[4px] bg-ui-accent px-1.5 py-0.5 font-ui text-[11px] font-medium text-white`}>{layerName(recipe, b)}</span>
    </div>
  );
}

/** Where a tile dragged over the stage lands (G12): into a container at its end, or before or after a block in its parent. */
interface StageDrop {
  key: string;
  where: "inside" | "before" | "after";
  /** The block's parent lays its blocks out side by side (the mark is a line at its left or right). */
  across: boolean;
  toParent: number[];
  index: number;
  /** "into Row", "after Ring". */
  text: string;
  why?: string;
}

/** The stage's drop mark: an outline on the container a tile goes into, else a line on the side of the block it goes by. */
function DropMark({ zone, drop, tick }: { zone: HTMLElement | null; drop: StageDrop; tick: unknown }) {
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
      <span className={cn("absolute left-0 top-full mt-1 whitespace-nowrap rounded-[4px] px-1.5 py-0.5 font-ui text-[11px] font-medium", drop.why ? "border border-ui-warn bg-ui-panel text-ui-warn" : "bg-ui-accent text-white")}>{drop.why ?? `Add ${drop.text}`}</span>
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
    const next = withFormat(r);
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
  /** Selects `paths`, the primary the last unless named. */
  const setSelection = (paths: readonly number[][], primary: number[] = paths[paths.length - 1] ?? []) => {
    setPrimary(primary);
    setAlso(paths.filter((x) => x.join(".") !== primary.join(".")));
    anchor.current = primary;
  };
  const setPath = (at: number[]) => setSelection([at]);
  const [tab, setTab] = useState<Tab>("block");
  const [size, setSize] = useState<Cells>(recipe.size.default);
  const [live, setLive] = useState(true);
  const [lookId, setLookId] = useState("classic");
  const [preset, setPreset] = useState<string | null>(recipe.presets.find((x) => x.default)?.id ?? null);
  const [name, setName] = useState<string | null>(null);
  const zoneHost = useRef<HTMLDivElement>(null);
  const [stageBox, setStageBox] = useState({ w: 700, h: 600 });
  const stageRef = useRef<HTMLDivElement>(null);

  // the stage follows the size of the preset it shows when that changes
  const presetSize = recipe.presets.find((x) => x.id === preset)?.size.join("x");
  useEffect(() => {
    if (presetSize) setSize(presetSize.split("x").map(Number) as Cells);
  }, [presetSize]);

  // a different recipe (a tab, a new one) starts at its own default
  useEffect(() => {
    setPath([]);
    setSize(recipe.size.default);
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
  const issues = useMemo(() => recipeIssues(recipe, p.active.images), [recipe, p.active.images]);
  const line = validationLine(recipe, issues);
  const problems = plainIssues(recipe, issues);
  const first = problems[0]?.text;
  // crowding at the size the stage shows (G19, B11), measured after it draws; null until then
  const [crowds, setCrowds] = useState<Crowd[] | null>(null);
  const warnings = crowds ? crowdIssues(recipe, size, crowds) : [];
  const listed = [...problems, ...warnings];
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
  /** A pick in Layers: that row only, added or taken away (Ctrl), or a range from the last pick (Shift). */
  const select = (at: number[], how: SelectHow) => {
    setTab("block");
    if (how === "only") return setPath(at);
    if (how === "range") {
      const rows = rangeOf(flatten(recipe).map((r) => keyOf(r.path)), keyOf(anchor.current), keyOf(at));
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
  const [tile, setTile] = useState<BlockType | null>(null);

  // after a command by keyboard the block it left selected keeps the focus in Layers, at its new place
  const [focusTick, setFocusTick] = useState(0);
  useEffect(() => {
    if (focusTick) document.querySelector<HTMLElement>(`[data-layer="${keyOf(path)}"]`)?.focus();
  }, [focusTick]);
  const refocus = () => setFocusTick((n) => n + 1);

  const firstSensor = Object.keys(live ? liveData : sampleData).find((k) => k.endsWith("_cpu_total")) ?? Object.keys(liveData)[0] ?? "libre.cpu_total";
  const add = (type: (typeof ADD_ORDER)[number], byKey: boolean) => {
    const r = addBlock(recipe, path, type, firstSensor);
    edit(r.recipe);
    setPath(r.path);
    setTab("block");
    say(`Added ${BLOCK_LABEL[type]}`);
    if (byKey) refocus();
  };
  /** A tile dropped on Layers or the stage: the new block at that place, unless the validator would refuse it there. */
  const addAt = (type: BlockType, toParent: number[], index: number, where: string) => {
    const refused = addRefusal(recipe, type, toParent);
    if (refused) return refuse(refused);
    const r = addBlockAt(recipe, toParent, index, type, firstSensor);
    edit(r.recipe);
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
        edit(r.recipe);
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
      case "wrap": {
        const r = wrapInRow(recipe, list);
        if ("why" in r) return refuse(r.why);
        edit(r.recipe);
        setPath(r.path);
        refocus();
        return say(`Wrapped ${what(list)} in a row`);
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
      } else return;
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
  const stageTarget = (e: DragEvent): StageDrop | null => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-recipe-path]");
    if (!tile || (!el && !(e.target as HTMLElement).closest("[data-recipe-zone]"))) return null;
    const at = el ? el.dataset.recipePath!.split(".").map(Number) : [];
    const b = blockAt(recipe, at);
    if (!b) return null;
    const across = !!el?.parentElement && getComputedStyle(el.parentElement).flexDirection === "row";
    const r = el?.getBoundingClientRect();
    const f = r ? (across ? (e.clientX - r.left) / (r.width || 1) : (e.clientY - r.top) / (r.height || 1)) : 1;
    const where = "children" in b ? "inside" : f < 0.5 ? "before" : "after";
    const toParent = where === "inside" ? at : at.slice(0, -1);
    const index = "children" in b ? b.children.length : at[at.length - 1] + (where === "after" ? 1 : 0);
    const name = layerName(recipe, b);
    return { key: keyOf(at), where, across, toParent, index, text: where === "inside" ? `into ${name}` : `${where} ${name}`, why: addRefusal(recipe, tile, toParent) };
  };

  const pickPreset = (id: string) => {
    const x = recipe.presets.find((q) => q.id === id);
    setPreset(id);
    if (x) setSize(x.size);
  };
  const onImage = (file: File) => {
    void file.arrayBuffer().then((buf) => {
      const ext = file.type === "image/jpeg" ? "jpg" : file.type === "image/webp" ? "webp" : "png";
      const stem = file.name.toLowerCase().replace(/\.[a-z]+$/, "").replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "image";
      const path2 = `images/${stem}.${ext}`;
      const images = [...p.active.images.filter((f) => f.path !== path2), { path: path2, bytes: new Uint8Array(buf) }];
      const used = new Set(flatten(recipe).flatMap(({ block }) => (block.type === "image" ? [block.file] : [])));
      edit(blockAt(recipe, path)?.type === "image" ? updateBlock(recipe, path, { file: path2 }) : recipe, images.filter((f) => used.has(f.path) || f.path === path2));
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
      });
    }, 120);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [recipe, size.join("x"), live, lookId, preset, stageBox, data]);
  const fits = line.ok && crowds !== null && !warnings.length && recipe.root.children.length > 0;
  const shown = `${size[0]}×${size[1]}`;
  /** "Other" sizes (G17): a side typed in the stage's boxes, clamped to the recipe's range. */
  const setSide = (k: 0 | 1, v: number | undefined) => setSize(clampCells(recipe, k === 0 ? [v ?? size[0], size[1]] : [size[0], v ?? size[1]]));

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
              onSelect={select}
              onRename={rename}
              onCommand={run}
              onMove={drop}
              onAdd={(type, toParent, index) => addAt(type, toParent, index, `into ${nameAt(toParent)}`)}
              onWhy={setWhy}
            />
            {why && (
              <p role="status" data-move-why="" className="mt-1 px-2 text-micro leading-snug text-ui-warn">
                {why}
              </p>
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
          </div>
        </aside>
        <main className="flex min-w-0 flex-1 flex-col gap-3 p-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-body text-ui-3">Size</span>
            <Segmented label="Size" size="bar" value={`${size[0]}x${size[1]}`} options={sizes.map((c) => ({ value: `${c[0]}x${c[1]}`, label: `${c[0]}×${c[1]}` }))} onChange={(v) => setSize(v.split("x").map(Number) as Cells)} />
            <span className="flex items-center gap-1 text-body text-ui-3" title={`Any size from ${recipe.size.min.join("×")} to ${recipe.size.max.join("×")}`}>
              <NumberInput label="Stage columns" value={size[0]} min={recipe.size.min[0]} max={recipe.size.max[0]} onChange={(v) => setSide(0, v)} width={52} />
              ×
              <NumberInput label="Stage rows" value={size[1]} min={recipe.size.min[1]} max={recipe.size.max[1]} onChange={(v) => setSide(1, v)} width={52} />
            </span>
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
          <div
            ref={stageRef}
            role="presentation"
            data-builder-stage=""
            onClick={(e) => {
              const hit = (e.target as HTMLElement).closest<HTMLElement>("[data-recipe-path]");
              if (hit) {
                setPath(hit.dataset.recipePath!.split(".").map(Number));
                setTab("block");
              } else if ((e.target as HTMLElement).closest("[data-recipe-zone]")) setPath([]);
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
            className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-ui-lg border border-ui-subtle"
            style={{ backgroundImage: "radial-gradient(color-mix(in oklab, var(--ui-text-hint) 30%, transparent) 1px, transparent 1px)", backgroundSize: "16px 16px" }}
          >
            <div ref={zoneHost}>
              <RecipePreview
                recipe={live ? recipe : sampled}
                images={p.active.images}
                values={shownValues}
                cells={size}
                sample={!live}
                appearance={p.appearance}
                pageStyle={p.pageStyle}
                lookId={lookId}
                fit={{ w: Math.max(100, stageBox.w - 96), h: Math.max(80, stageBox.h - 96) }}
                maxScale={Math.min(1.6, 560 / w, 420 / h) > 1 ? Math.min(1.6, 560 / w, 420 / h) : 1}
                overlay={
                  <>
                    <Selection zone={zoneHost.current?.querySelector<HTMLElement>("[data-recipe-zone]") ?? null} path={path} recipe={recipe} tick={[recipe, size, live, lookId, preset, stageBox, data]} />
                    {stageDrop && <DropMark zone={zoneHost.current?.querySelector<HTMLElement>("[data-recipe-zone]") ?? null} drop={stageDrop} tick={[recipe, size, stageBox]} />}
                  </>
                }
              />
            </div>
          </div>
          <div role="status" data-validation="" className="flex items-center gap-2 text-caption">
            {line.ok && !warnings.length ? <CircleCheck className="h-4 w-4 shrink-0 text-ui-ok" strokeWidth={1.5} aria-hidden /> : <CircleAlert className="h-4 w-4 shrink-0 text-ui-warn" strokeWidth={1.5} aria-hidden />}
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
              <span className="text-ui-2">{[problems.length && `${problems.length} problem${problems.length === 1 ? "" : "s"}`, warnings.length && `${warnings.length} warning${warnings.length === 1 ? "" : "s"} at ${shown}`].filter(Boolean).join(", ")}</span>
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
              {selected.length} blocks selected: Delete, Duplicate, Copy, Cut and Wrap in a row act on all. The settings below are {layerName(recipe, blockAt(recipe, path) ?? recipe.root)}'s.
            </p>
          )}
          <TypingContext.Provider value={typing}>
            {tab === "block" && <BlockTab recipe={recipe} path={path} onChange={(r) => edit(r)} onRemove={() => run("delete", path)} onDuplicate={() => run("duplicate", path)} data={data} names={live ? names : undefined} devices={devices} onOpenSources={p.onOpenSources} onImage={onImage} nextVersion={p.active.stored?.version === recipe.version ? nextVersion(recipe.version) : recipe.version} />}
            {tab === "options" && <OptionsTab recipe={recipe} onChange={(r) => edit(r)} data={{ ...sampleData, ...liveData }} onOpenSources={p.onOpenSources} />}
            {tab === "presets" && <PresetsTab recipe={recipe} onChange={(r) => edit(r)} current={preset} onPick={pickPreset} values={shownValues} size={size} />}
          </TypingContext.Provider>
        </aside>
      </div>
    </div>
  );
}

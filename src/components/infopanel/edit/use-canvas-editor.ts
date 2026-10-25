/**
 * The canvas editor's state (A5, spec §7): the zone's items as edited, the selection, and every
 * edit committed to the studio config as the zone's new stored form, so the studio's undo
 * history holds them (one drag, one field, one bulk action = one step). A drag shows a preview
 * and commits once.
 */
import { useMemo, useState } from "react";
import type { HistorySetter } from "@/hooks/use-config-history";
import type { IconSource } from "@/lib/effects/icon";
import type { Placement } from "@/lib/layout";
import { openCanvas, type OpenCanvas } from "@/lib/infopanel/canvas";
import {
  bindItem,
  changedGroups,
  drawAllAs,
  editContext,
  editItems,
  itemModes,
  itemOverrides,
  livePaths,
  rangeSelect,
  storeItems,
  withElementFile,
  withNewFileItem,
  withNewItem,
  withRemap,
  type DropPlace,
  type DroppedFile,
  type ItemMode,
  type SensorMode,
} from "@/lib/infopanel/canvas-edit";
import {
  duplicate as duplicateItems,
  itemAt,
  moveBy,
  removeAll,
  reorder as reorderItem,
  setField,
  updateAt,
  type Box,
  type Path,
} from "@/lib/infopanel/editor/ops";
import { groupItems, moveItems, ungroupAt } from "@/lib/infopanel/editor/groups";
import { align as alignBoxes, distribute as distributeBoxes, type AlignEdge, type Shift } from "@/lib/infopanel/editor/arrange";
import { sensorOfCatalog, type ChosenSensor } from "@/lib/infopanel/editor/bind";
import type { ConvertContext } from "@/lib/infopanel/native/convert";
import { recolour, syncElements } from "@/lib/infopanel/elements/apply";
import { defaultPalette, type Palette, type Slot } from "@/lib/infopanel/elements/palette";
import type { ElementSpec } from "@/lib/infopanel/elements/spec";
import { groupBindings, type CatalogIndex, type Group } from "@/lib/infopanel/remap/remap";
import type { DisplayItem, Profile } from "@/lib/infopanel/schema";
import type { DataApiValue } from "@/lib/infopanel/sensors";
import type { StoredCanvas } from "@/lib/infopanel/import/stored";
import type { DashboardConfig } from "@/lib/layout";

/** The zone's stored form in the config replaced (`withCanvas` from the studio's import actions). */
export type ReplaceCanvas = (config: DashboardConfig, zoneId: string, canvas: StoredCanvas) => DashboardConfig;

export interface CanvasEditor {
  zone: Placement;
  open: OpenCanvas;
  /** What is drawn: the drag preview while one runs, else the committed items. */
  items: DisplayItem[];
  /** The items as committed (the inspector edits these). */
  committed: DisplayItem[];
  ctx: ConvertContext;
  modes: Map<Path, ItemMode>;
  selection: Path[];
  select(paths: Path[]): void;
  /** A click: select only `path`, or add / remove it (Ctrl). */
  pick(path: Path, additive: boolean): void;
  /** Shift-click in the tree: from the last picked item to `path`. */
  range(path: Path): void;
  preview(items: DisplayItem[] | null): void;
  /** One undo step; a `key` coalesces repeats (typing, arrow nudges). */
  commit(items: DisplayItem[], key?: string, selection?: Path[]): void;
  setField(path: Path, field: string, value: unknown, key?: string): void;
  /** A whole new stored form (items and assets changed together, e.g. a dropped library image): one step. */
  commitStored(stored: StoredCanvas, selection?: Path[]): void;
  duplicate(): void;
  /** Groups the selection (any parents) into a new group: one step, or the reason it can't is shown. */
  group(): void;
  /** Replaces the selected group with its children: one step, or the reason it can't is shown. */
  ungroup(): void;
  /** Moves the selection into the group at `parent` ("" is the top level), ahead of that list's child `index`: one step, or the reason it can't is shown. */
  move(parent: Path, index: number): void;
  reorder(step: -1 | 1): void;
  remove(): void;
  nudge(dx: number, dy: number): void;
  /** The drawn boxes of the selected items, in profile pixels, as the edit layer last measured them. */
  boxes: Readonly<Record<Path, Box>>;
  setBoxes(boxes: Record<Path, Box>): void;
  /** Aligns two or more unlocked selected items: one step. */
  align(edge: AlignEdge): void;
  /** Spreads three or more unlocked selected items evenly: one step. */
  distribute(axis: "horizontal" | "vertical"): void;
  /** One field set on every selected item that has it, each value already checked: one step. */
  setFields(values: ReadonlyMap<Path, unknown>, field: string): void;
  drawAll(native: boolean): void;
  /** A profile field (Name, size, colours, WebView …), already checked: one step; a `key` coalesces typing. */
  setProfile(field: keyof Profile, value: unknown, key?: string): void;
  /** The profile's palette (studio-only): the stored one, else the default. */
  palette: Palette;
  /** One palette slot set (#AARRGGBB): every element and styled field following it is recoloured, in one step. */
  setPalette(slot: Slot, color: string, key?: string): void;
  /** A studio element's spec replaced; its InfoPanel fields follow on commit. */
  setElement(path: Path, spec: ElementSpec, key?: string): void;
  /** A studio element's spec built from a Library file, which joins the canvas's files; one step. */
  setElementFile(path: Path, file: DroppedFile, make: (source: IconSource) => ElementSpec | null): void;
  /** A new item (the Add palette) placed by InfoPanel's rules, centred or where it was dropped, and selected; returns its path. */
  add(item: DisplayItem, place?: DropPlace): Path;
  /** A new Image or Sensor image showing a file (it joins the canvas's files); returns its path. */
  addWithFile(item: DisplayItem, file: DroppedFile, place?: DropPlace): Path;
  /** Binds an item to a Data API sensor, natively too when the Data API gives its ref. */
  bind(path: Path, sensor: ChosenSensor, rename?: (item: DisplayItem) => DisplayItem): void;
  /** Remap: binding groups, the user's choices, and a change applied as one step. */
  groups: Group[];
  overrides: Map<string, string>;
  applyOverrides(next: Map<string, string>, index: CatalogIndex): void;
  sensorMode: SensorMode;
  setSensorMode(mode: SensorMode): void;
  /** Mock values by binding group. */
  mock: ReadonlyMap<string, number>;
  setMock(groupId: string, value: number): void;
}

export function useCanvasEditor(
  zone: Placement & { canvas: StoredCanvas },
  setConfig: HistorySetter,
  replace: ReplaceCanvas,
  initialSelection: Path[] = [],
  refuse: (reason: string) => void = () => {},
): CanvasEditor {
  const open = useMemo(() => openCanvas(zone.canvas), [zone.canvas]);
  const committed = useMemo(() => editItems(open), [open]);
  const [draft, setDraft] = useState<DisplayItem[] | null>(null);
  const [rawSelection, setSelection] = useState<Path[]>(initialSelection);
  const [anchor, setAnchor] = useState<Path | null>(null);
  const [sensorMode, setSensorMode] = useState<SensorMode>("live");
  const [mock, setMockMap] = useState<ReadonlyMap<string, number>>(new Map());
  const [boxes, setBoxes] = useState<Record<Path, Box>>({});
  const items = draft ?? committed;
  const ctx = useMemo(() => editContext(open), [open]);
  const modes = useMemo(() => itemModes(items, ctx), [items, ctx]);
  const groups = useMemo(() => groupBindings(committed), [committed]);
  const overrides = useMemo(() => itemOverrides(committed), [committed]);
  // An undo can take selected items away: select only what is still there.
  const selection = useMemo(() => livePaths(committed, rawSelection), [committed, rawSelection]);

  const palette = useMemo(() => open.stored.palette ?? defaultPalette(open.profile), [open]);

  const commit = (next: DisplayItem[], key?: string, nextSelection?: Path[]) => {
    setDraft(null);
    if (nextSelection) setSelection(nextSelection);
    if (next === committed) return;
    // Studio elements follow their spec and box: a resize, a moved group or a spec edit lands with its derived fields.
    const stored = storeItems(open.stored, open.profile, syncElements(next));
    setConfig((c) => replace(c, zone.id, stored), key);
  };

  const single = selection.length === 1 ? selection[0] : null;
  const commitWith = (stored: StoredCanvas, nextSelection?: Path[], key?: string) => {
    setDraft(null);
    if (nextSelection) setSelection(nextSelection);
    setConfig((c) => replace(c, zone.id, stored), key);
  };
  // Align and distribute move what they can: locked items stay put and are left out.
  const placed = () => selection.filter((p) => boxes[p] && !itemAt(committed, p)?.IsLocked).map((p) => ({ path: p, box: boxes[p] }));
  const shifted = (shifts: Shift[]) => {
    if (shifts.length) commit(shifts.reduce((tree, s) => moveBy(tree, [s.path], s.dx, s.dy), committed));
  };

  return {
    zone,
    open,
    items,
    committed,
    ctx,
    modes,
    selection,
    select: (paths) => {
      setSelection(paths);
      setAnchor(paths.at(-1) ?? null);
    },
    pick: (path, additive) => {
      setSelection((s) => (additive ? (s.includes(path) ? s.filter((p) => p !== path) : [...s, path]) : [path]));
      setAnchor(path);
    },
    range: (path) => setSelection(anchor ? rangeSelect(committed, anchor, path) : [path]),
    preview: setDraft,
    commit,
    setField: (path, field, value, key) => commit(setField(committed, path, field, value), key),
    commitStored: (stored, nextSelection) => commitWith(stored, nextSelection),
    duplicate: () => {
      if (!selection.length) return;
      const r = duplicateItems(committed, selection);
      commit(r.items, undefined, r.paths);
    },
    group: () => {
      const r = groupItems(committed, selection);
      if (!r.ok) return refuse(r.reason);
      commit(r.items, undefined, [r.path]);
    },
    ungroup: () => {
      const g = single ? itemAt(committed, single) : undefined;
      const r = single ? ungroupAt(committed, single) : null;
      if (!r) return g?.kind === "Group" ? refuse("Cores places its own bars, so it can’t be ungrouped.") : undefined;
      commit(r.items, undefined, r.paths);
    },
    move: (parent, index) => {
      // A group dropped into opens first (on the paths as they are now), so the move shows.
      const base = parent === "" ? committed : updateAt(committed, parent, (g) => (g.kind === "Group" && !g.IsExpanded ? { ...g, IsExpanded: true } : g));
      const r = moveItems(base, selection, parent, index);
      if (!r.ok) return refuse(r.reason);
      commit(r.items, undefined, r.paths);
    },
    reorder: (step) => {
      if (!single) return;
      const r = reorderItem(committed, single, step);
      if (r.path !== single) commit(r.items, undefined, [r.path]);
    },
    remove: () => {
      if (selection.length) commit(removeAll(committed, selection), undefined, []);
    },
    nudge: (dx, dy) => {
      const movable = selection.filter((p) => !itemAt(committed, p)?.IsLocked);
      if (movable.length) commit(moveBy(committed, movable, dx, dy), `canvas-nudge:${zone.id}`);
    },
    boxes,
    setBoxes,
    align: (edge) => shifted(alignBoxes(placed(), edge)),
    distribute: (axis) => shifted(distributeBoxes(placed(), axis)),
    setFields: (values, field) => {
      let next = committed;
      for (const [p, v] of values) next = setField(next, p, field, v);
      if (next !== committed) commit(next);
    },
    drawAll: (native) => commit(drawAllAs(committed, modes, native)),
    setProfile: (field, value, key) => {
      if (Object.is(open.profile[field], value)) return;
      commitWith(storeItems(open.stored, { ...open.profile, [field]: value }, committed), undefined, key);
    },
    palette,
    setPalette: (slot, color, key) => {
      if (palette[slot] === color) return;
      const next = { ...palette, [slot]: color };
      commitWith(storeItems({ ...open.stored, palette: next }, open.profile, recolour(committed, next)), undefined, key);
    },
    setElement: (path, spec, key) => commit(updateAt(committed, path, (item) => ({ ...item, element: spec }) as unknown as DisplayItem), key),
    setElementFile: (path, file, make) => {
      const stored = withElementFile(open.stored, open.profile, committed, path, file, make);
      if (stored) commitWith(stored);
    },
    add: (item, place) => {
      const r = withNewItem(committed, open.profile, item, single, place);
      commit(r.items, undefined, [r.path]);
      setAnchor(r.path);
      return r.path;
    },
    addWithFile: (item, file, place) => {
      const r = withNewFileItem(open.stored, open.profile, committed, item, file, single, place);
      commitWith(r.stored, [r.path]);
      setAnchor(r.path);
      return r.path;
    },
    bind: (path, sensor, rename = (i) => i) => {
      const item = itemAt(committed, path);
      if (item) commit(updateAt(committed, path, () => bindItem(rename(item), sensor)));
    },
    groups,
    overrides,
    applyOverrides: (next, index) => {
      if (changedGroups(overrides, next).size === 0) return;
      commit(withRemap(committed, overrides, next, index, sensorOfCatalog(index.catalog.sensors as Record<string, DataApiValue>)));
    },
    sensorMode,
    setSensorMode,
    mock,
    setMock: (id, value) => setMockMap((m) => new Map(m).set(id, value)),
  };
}

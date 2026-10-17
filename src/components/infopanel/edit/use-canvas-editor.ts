/**
 * The canvas editor's state (A5, spec §7): the zone's items as edited, the selection, and every
 * edit committed to the studio config as the zone's new stored form, so the studio's undo
 * history holds them (one drag, one field, one bulk action = one step). A drag shows a preview
 * and commits once.
 */
import { useMemo, useState } from "react";
import type { HistorySetter } from "@/hooks/use-config-history";
import type { Placement } from "@/lib/layout";
import { openCanvas, type OpenCanvas } from "@/lib/infopanel/canvas";
import {
  changedGroups,
  drawAllAs,
  editContext,
  editItems,
  itemModes,
  itemOverrides,
  livePaths,
  rangeSelect,
  storeItems,
  withGroupKeys,
  type ItemMode,
  type SensorMode,
} from "@/lib/infopanel/canvas-edit";
import {
  duplicate as duplicateItems,
  group as groupItems,
  itemAt,
  moveBy,
  removeAll,
  reorder as reorderItem,
  setField,
  topmost,
  ungroup as ungroupItem,
  type Path,
} from "@/lib/infopanel/editor/ops";
import { remapKeys } from "@/lib/infopanel/import/stored";
import type { ConvertContext } from "@/lib/infopanel/native/convert";
import { groupBindings, resolveAll, type CatalogIndex, type Group } from "@/lib/infopanel/remap/remap";
import type { DisplayItem } from "@/lib/infopanel/schema";
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
  group(): void;
  ungroup(): void;
  reorder(step: -1 | 1): void;
  remove(): void;
  nudge(dx: number, dy: number): void;
  drawAll(native: boolean): void;
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
): CanvasEditor {
  const open = useMemo(() => openCanvas(zone.canvas), [zone.canvas]);
  const committed = useMemo(() => editItems(open), [open]);
  const [draft, setDraft] = useState<DisplayItem[] | null>(null);
  const [rawSelection, setSelection] = useState<Path[]>(initialSelection);
  const [anchor, setAnchor] = useState<Path | null>(null);
  const [sensorMode, setSensorMode] = useState<SensorMode>("live");
  const [mock, setMockMap] = useState<ReadonlyMap<string, number>>(new Map());
  const items = draft ?? committed;
  const ctx = useMemo(() => editContext(open), [open]);
  const modes = useMemo(() => itemModes(items, ctx), [items, ctx]);
  const groups = useMemo(() => groupBindings(committed), [committed]);
  const overrides = useMemo(() => itemOverrides(committed), [committed]);
  // An undo can take selected items away: select only what is still there.
  const selection = useMemo(() => livePaths(committed, rawSelection), [committed, rawSelection]);

  const commit = (next: DisplayItem[], key?: string, nextSelection?: Path[]) => {
    setDraft(null);
    if (nextSelection) setSelection(nextSelection);
    if (next === committed) return;
    const stored = storeItems(open.stored, open.profile, next);
    setConfig((c) => replace(c, zone.id, stored), key);
  };

  const single = selection.length === 1 ? selection[0] : null;

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
    commitStored: (stored, nextSelection) => {
      setDraft(null);
      if (nextSelection) setSelection(nextSelection);
      setConfig((c) => replace(c, zone.id, stored));
    },
    duplicate: () => {
      if (!selection.length) return;
      const r = duplicateItems(committed, selection);
      commit(r.items, undefined, r.paths);
    },
    group: () => {
      const r = topmost(selection).length > 1 ? groupItems(committed, selection) : null;
      if (r) commit(r.items, undefined, [r.path]);
    },
    ungroup: () => {
      const r = single ? ungroupItem(committed, single) : null;
      if (r) commit(r.items, undefined, r.paths);
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
    drawAll: (native) => commit(drawAllAs(committed, modes, native)),
    groups,
    overrides,
    applyOverrides: (next, index) => {
      const changed = changedGroups(overrides, next);
      if (changed.size === 0) return;
      const resolved = resolveAll(groups, index, next);
      commit(withGroupKeys(committed, remapKeys(resolved, next), changed));
    },
    sensorMode,
    setSensorMode,
    mock,
    setMock: (id, value) => setMockMap((m) => new Map(m).set(id, value)),
  };
}

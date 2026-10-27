/**
 * The canvas editor (A5, spec §7), Edit's body on a Free page (one canvas filling the screen) or on a free area
 * opened from a grid page (one-editor SPEC §5). It sits in the studio's own shell, with Design's slots and widths:
 * the left panel's Layers | Add tabs hold the item tree and the Add palette, the page tabs, toolbar and canvas fill
 * the middle, and the inspector column shows the item, the profile's settings with nothing selected, or the Export
 * check. It edits one canvas zone's stored form, and every edit goes through the studio's one history, so undo,
 * redo and auto-save work as anywhere in the studio. Lazy-loaded: the InfoPanel model stays out of the studio's
 * first bundle.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import type { HistorySetter } from "@/hooks/use-config-history";
import { useToast } from "@/components/ui/toast";
import { createLibraryItem, type LibraryItem } from "@/lib/library";
import { saveComponent, componentPaths, withComponent } from "@/lib/infopanel/component";
import { recordCopy } from "@/lib/my-library/copies";
import { canvasData, componentItem } from "@/lib/my-library/canvas-link";
import { rolesOf } from "@/lib/my-library/component-meta";
import { useSensors } from "@/hooks/useSensors";
import { getCatalog, useSensorCatalog } from "@/lib/catalog";
import { editKeyOf } from "@/lib/infopanel/canvas-edit";
import { namedFor, newItem, type PaletteEntry } from "@/lib/infopanel/editor/create";
import { applyElement } from "@/lib/infopanel/elements/apply";
import { detectCores } from "@/lib/infopanel/elements/cores";
import { detectDrives } from "@/lib/infopanel/elements/drives";
import { elementSize, isComposite, newComposite, newCores, newElement, type ElementEntry } from "@/lib/infopanel/elements/create";
import type { DropPlace } from "@/lib/infopanel/canvas-edit";
import { itemAt, setBox } from "@/lib/infopanel/editor/ops";
import type { Placement } from "@/lib/layout";
import { filterCounts, remapRows, resolveAll } from "@/lib/infopanel/remap/remap";
import { keptScreenshot } from "@/lib/infopanel/canvas";
import { editKeys, sensorView } from "@/lib/infopanel/canvas-edit";
import type { Path } from "@/lib/infopanel/editor/ops";
import type { StoredCanvas } from "@/lib/infopanel/import/stored";
import type { DataApiValue } from "@/lib/infopanel/sensors";
import { cn } from "@/lib/utils";
import { checkItems, isImported } from "@/lib/infopanel/export-check";
import { LeftPanelFrame, type LeftTab } from "@/components/studio/design-left-panel";
import { StudioShell } from "@/components/studio/studio-shell";
import type { useStudioLayout } from "@/components/studio/use-studio-layout";
import { withCanvas } from "@/components/studio/import-actions";
import { withFreeCanvas } from "@/lib/free-pages";
import { ExportCheckContext, ExportCheckPanel, ExportCheckPill, type ExportCheckState } from "../export-check-panel";
import { RemapDialog, useRemapIndex } from "../remap-dialog";
import { AddPalette, ITEM_COUNT, PaletteGroups, paletteEntryOf, type AddEntry } from "./add-palette";
import { AddPanel } from "@/components/studio/add-panel";
import { addCatalog, sameDrop, type AddItem } from "@/components/studio/add-catalog";
import { freeSize } from "@/components/studio/add-place";
import { useAddFilter, useAddListDensity, useAddPreviewOnHover } from "@/components/studio/add-prefs";
import { useRecentWidgets } from "@/components/studio/add-recent";
import { ADD_TOAST_MS } from "@/components/studio/use-add-panel";
import { deletePanelPreset, renamePanelPreset } from "@/components/studio/panel-preset-actions";
import { mergePrefixes, placementPrefixes, widgetPlacement } from "@/components/studio/placement-content";
import { widgetItemRow, type CheckStatus } from "@/lib/infopanel/export-check";
import { isWidgetItem, newWidgetItem, widgetOf, widgetPaths } from "@/lib/infopanel/native/widget-item";
import { cellOfWidget, holdsWidget, moveOnCells, resizeOnCells } from "@/lib/infopanel/editor/cells";
import { canvasGrid } from "@/lib/page-model/canvas-adapter";
import { cellsForAdd } from "@/lib/page-model/gesture";
import { cellRect, trackOf, type PageGrid } from "@/lib/page-model/model";
import { StatusIcon } from "../export-check-panel";
import { addedMessage, widgetRecordFor } from "./widget-add";
import { WidgetItemInspector, type WidgetHost } from "./widget-item-inspector";
import type { WidgetDrop } from "./edit-canvas";
import { canvasKeyAction } from "./canvas-keys";
import { CanvasToolbar, CompareStrip, ModesStrip } from "./canvas-toolbar";
import { EditCanvas, type Compare } from "./edit-canvas";
import { ImagePicker } from "./image-picker";
import { ItemInspector } from "./item-inspector";
import { ItemsTree } from "./items-tree";
import { SaveComponentDialog } from "./save-component-dialog";
import { ProfileSettings } from "./profile-settings";
import { SensorPicker } from "./sensor-picker";
import { useCanvasEditor, type CanvasEditor } from "./use-canvas-editor";
import { useLibraryLink } from "./use-library-link";

/** The studio's shell around the editor: its layout, the rail, the left panel's state and the page tabs. */
export interface EditorShell {
  layout: ReturnType<typeof useStudioLayout>;
  rail: ReactNode;
  railWidth: number;
  leftOpen: boolean;
  leftTab: LeftTab;
  onLeftTab: (tab: LeftTab) => void;
  leftWidth: number;
  /** The studio's page tabs, over the toolbar, with the editor's Export check pill in them (none when the check is off). */
  pageTabs?: (pill: ReactNode) => ReactNode;
}

export interface CanvasEditorProps {
  zone: Placement & { canvas: StoredCanvas };
  setConfig: HistorySetter;
  history: { canUndo: boolean; canRedo: boolean; undo: () => void; redo: () => void };
  shell: EditorShell;
  /** Back to the grid page a free area is on (Done); none on a Free page, which is the page itself. */
  onDone?: () => void;
  /** Another view (the Library) covers the editor: it stays mounted, draws nothing, and its keys do nothing. */
  hidden?: boolean;
  /** The screen is made for InfoPanel: the Export check pill, the badges and the On InfoPanel lines show. */
  checkOn?: boolean;
  /** The command palette's Export check: each new value opens the check in the inspector. */
  checkRequest?: number;
  /** Export .infopanel: the export dialog for this zone. */
  onExport?: () => void;
  /** The active profile (a dropped Library image is recorded as a copy there). */
  profileId: string;
  /** Items selected on open (the Library's "uses", a font's text items). */
  initialSelection?: string[];
  /** A Gauge item's "Edit gauge…": open it in Gauges. */
  onEditGauge?: (path: Path) => void;
  /** A new profile's template sensors that weren't found on this machine, shown with Remap until dismissed. */
  unbound?: readonly string[];
  onDismissUnbound?: () => void;
  /** Studio widgets on the page (one-editor SPEC §3.3): on a Free page, Add offers them beside InfoPanel items. */
  widgetHost?: WidgetHost;
  /** A Free page's Layout control (SPEC §6.1): switch the page to Grid. */
  onLayout?: () => void;
  /**
   * An InfoPanel item or element to add as the editor opens (a palette drag id, `PALETTE_DRAG`): one dropped or
   * clicked on a grid page, which made this free area for it (SPEC §5.3). `at` is where, in the canvas's px.
   */
  initialAdd?: { data: string; at?: { x: number; y: number } };
}

const isTyping = (el: Element | null) =>
  el instanceof HTMLElement && (el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");
/** The item the sensor picker binds; `fresh` (just added) takes the sensor's name too, as InfoPanel names it. */
interface PickFor {
  path: Path;
  label: string;
  pluginOnly: boolean;
  fresh: boolean;
}

const hasOverlay = () => document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]') !== null;

/** The selection moved by whole cells (SPEC §14): widget items onto free cells (refused when they aren't), the rest by the cells' pitch. */
function byCells(ed: CanvasEditor, grid: PageGrid, dc: number, dr: number) {
  const movable = ed.selection.filter((p) => !itemAt(ed.committed, p)?.IsLocked);
  const items = movable.length ? moveOnCells(grid, ed.committed, movable, dc, dr) : null;
  if (items) ed.commit(items, `canvas-nudge:${ed.zone.id}`);
}

/** The one selected part a cell wider, narrower, taller or shorter: a widget item onto free cells, an item by the cells' pitch. */
function resizeByCell(ed: CanvasEditor, grid: PageGrid, dx: number, dy: number) {
  if (ed.selection.length !== 1) return;
  const [path] = ed.selection;
  const item = itemAt(ed.committed, path);
  if (!item || item.IsLocked || item.kind === "Group") return;
  const key = `canvas-nudge:${ed.zone.id}`;
  if (isWidgetItem(item)) {
    const c = cellOfWidget(grid, item);
    const items = resizeOnCells(grid, ed.committed, path, cellRect(grid, { ...c, cols: Math.max(1, c.cols + dx), rows: Math.max(1, c.rows + dy) }));
    if (items) ed.commit(items, key);
    return;
  }
  const b = ed.boxes[path];
  const t = trackOf(grid);
  if (b) ed.commit(setBox(ed.committed, path, { ...b, width: Math.max(1, b.width + dx * (t.w + grid.gap)), height: Math.max(1, b.height + dy * (t.h + grid.gap)) }), key);
}

export default function CanvasEditorView({ zone, setConfig, history, shell, onDone, hidden = false, checkOn = false, checkRequest = 0, onExport, profileId, initialSelection, onEditGauge, unbound, onDismissUnbound, widgetHost, onLayout, initialAdd }: CanvasEditorProps) {
  const toast = useToast();
  /** A Free page (not a free area opened from a grid page) takes Studio widgets too, and its size is the screen's. */
  const freePage = !onDone && widgetHost !== undefined;
  const editor = useCanvasEditor(zone, setConfig, freePage ? withFreeCanvas : withCanvas, initialSelection, toast);
  /** The page's grid over a canvas filling the screen (Edit v3 SPEC §3.7): cell lines, cell snapping, widgets on cells. */
  const grid = useMemo(() => (freePage && widgetHost ? canvasGrid(widgetHost.profile, zone.canvas) : undefined), [freePage, widgetHost?.profile, zone.canvas]);
  const snapItems = widgetHost?.config.profiles.find((p) => p.id === widgetHost.profile.id)?.pages.find((pg) => pg.id === widgetHost.profile.pageId)?.snapItems !== false;
  const [showModes, setShowModes] = useState(false);
  const [compareOn, setCompareOn] = useState(false);
  // The screenshot the canvas kept at import is Compare's start; "choose another" replaces it.
  const [compare, setCompare] = useState<Compare | null>(() => keptScreenshot(zone.canvas));
  const [remapOpen, setRemapOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const { index, online, unreachable } = useRemapIndex();
  const sensors = useSensorCatalog().sensors as unknown as Record<string, DataApiValue>;
  const [pickFor, setPickFor] = useState<PickFor | null>(null);
  const [fileFor, setFileFor] = useState<{ entry: PaletteEntry; place?: DropPlace } | null>(null);
  /** An Add palette click or drop: the kind with its new-item look, selected; a sensor kind asks for its sensor. */
  const askSensor = (entry: PaletteEntry, path: Path) => {
    if (entry.sensor) setPickFor({ path, label: entry.label, pluginOnly: entry.pluginOnly === true, fresh: true });
  };
  /** A studio element: a ring, LED bar or sparkline asks for its sensor; Cores binds to the cores the Data API reports. */
  const addElement = (entry: ElementEntry, place?: DropPlace) => {
    const { profile } = editor.open;
    if (entry.type === "cores") {
      const cores = detectCores(sensors);
      const group = newCores(profile, editor.palette, cores, 0, 0);
      const size = "element" in group ? (group.element as { width: number; height: number }) : { width: 0, height: 0 };
      const at = place?.at ?? { x: profile.Width / 2, y: profile.Height / 2 };
      editor.add(applyElement({ ...group, X: Math.round(at.x - size.width / 2), Y: Math.round(at.y - size.height / 2) }));
      if (cores.length === 0) toast("No per-core load sensors found, so Cores shows placeholder bars");
      return;
    }
    if (isComposite(entry.type)) {
      const drives = entry.type === "drives" ? detectDrives(sensors, getCatalog().sources?.hwinfo) : [];
      const probe = newComposite(entry.type, profile, editor.palette, drives, 0, 0);
      const size = elementSize((probe as unknown as { element: Parameters<typeof elementSize>[0] }).element);
      const at = place?.at ?? { x: profile.Width / 2, y: profile.Height / 2 };
      editor.add(newComposite(entry.type, profile, editor.palette, drives, Math.round(at.x - size.width / 2), Math.round(at.y - size.height / 2)));
      if (entry.type === "drives" && drives.length === 0) toast("No drives found in the Data API, so Drives shows placeholder tiles");
      else if (entry.type !== "drives") toast("Pick a part in Layers to choose its sensor");
      return;
    }
    const path = editor.add(newElement(entry.type, profile, editor.palette), place);
    if (entry.sensor) setPickFor({ path, label: entry.label, pluginOnly: false, fresh: true });
  };
  const onAdd = (add: AddEntry, place?: DropPlace) => {
    if (add.kind === "element") return addElement(add.entry, place);
    const { entry } = add;
    if (entry.file) return setFileFor({ entry, place });
    askSensor(entry, editor.add(newItem(entry.kind, editor.open.profile, editor.palette), place));
  };
  const catalog = useMemo(() => addCatalog(widgetHost?.config.panelPresets), [widgetHost?.config.panelPresets]);
  const [recent, pushRecent] = useRecentWidgets();
  const [addFilter, setAddFilter] = useAddFilter();
  const [addDensity] = useAddListDensity();
  const [addPreview] = useAddPreviewOnHover();
  /** A Studio widget from Add (a click, Enter or a drop at `at`): a widget item at its default size, selected, one step. */
  const addWidget = (row: AddItem, at?: { x: number; y: number }) => {
    const widget = widgetRecordFor(row, widgetHost?.config.panelPresets);
    if (!widget) return;
    const { profile } = editor.open;
    if (grid) {
      // On the page's cells: under the pointer, or the first free ones; the nearest free cells when others sit there.
      const others = widgetPaths(editor.committed).map((p) => cellOfWidget(grid, itemAt(editor.committed, p)!));
      const cell = cellsForAdd(grid, at ?? null, { cols: row.w, rows: row.h }, others);
      if (!cell) return toast("No free cells here.");
      const box = cellRect(grid, cell);
      editor.add(newWidgetItem({ ...widget, cell }, box, row.name), { at: { x: box.x + box.w / 2, y: box.y + box.h / 2 } });
    } else {
      const size = freeSize({ cols: row.w, rows: row.h }, { width: profile.Width, height: profile.Height });
      editor.add(newWidgetItem(widget, { x: 0, y: 0, ...size }, row.name), at ? { at } : undefined);
    }
    if (row.kind === "widget") pushRecent(row.id);
    if (checkOn) toast(addedMessage(row.name, widget), { action: { label: "Undo", onClick: history.undo }, ms: ADD_TOAST_MS });
  };
  const placeWidget = (drop: WidgetDrop, at: { x: number; y: number }) => {
    const row = [...catalog.widget, ...catalog.panel].find((i) => sameDrop(i.drop, drop));
    if (row) addWidget(row, at);
  };
  /** Each Add row's Export check status, on a screen made for InfoPanel. */
  const rowStatus = useMemo(() => {
    if (!checkOn) return undefined;
    const byId = new Map<string, CheckStatus>();
    for (const row of [...catalog.widget, ...catalog.panel]) {
      const widget = widgetRecordFor(row, widgetHost?.config.panelPresets);
      const r = widget && widgetItemRow(newWidgetItem(widget, { x: 0, y: 0, w: 1, h: 1 }, row.name), "0");
      if (r) byId.set(`${row.kind}:${row.id}`, r.status);
    }
    return byId;
  }, [checkOn, catalog, widgetHost?.config.panelPresets]);
  // Live values for the Studio widgets' own keys, one subscription for the page (no stream per widget).
  const widgetKeys = useMemo(
    () => mergePrefixes(widgetPaths(editor.committed).map((p) => placementPrefixes(widgetPlacement(widgetOf(itemAt(editor.committed, p))!)))),
    [editor.committed],
  );
  const widgetSensors = useSensors(widgetKeys);
  const libraryLink = useLibraryLink(zone.id, zone.canvas, editor.open.profile.Name || zone.canvas.source.name);
  const single = editor.selection.length === 1 ? itemAt(editor.committed, editor.selection[0]) : undefined;
  const pickTarget = pickFor ? itemAt(editor.committed, pickFor.path) : undefined;
  const { layout } = shell;
  const selectionKey = editor.selection.join("\n");
  const hasSelection = editor.selection.length > 0;
  /** The Export check in the inspector: the header pill opens it; selecting anything or Esc closes it. */
  const [checkOpen, setCheckOpen] = useState(false);
  // The inspector follows the selection as Design's does: a selection shows it, clearing puts a floating one away.
  useEffect(() => {
    if (hidden) return;
    layout.setHasSelection(hasSelection);
    if (hasSelection) {
      setCheckOpen(false);
      layout.showInspector();
    } else layout.dismissInspector();
  }, [selectionKey, hidden]);
  // The zoom bar's size button shows the profile's settings with nothing selected.
  const openSettings = () => {
    editor.select([]);
    setCheckOpen(false);
    layout.showInspector();
  };
  const toggleCheck = () => {
    if (checkOpen) return setCheckOpen(false);
    editor.select([]);
    setCheckOpen(true);
    layout.showInspector();
  };
  const seenRequest = useRef(checkRequest);
  useEffect(() => {
    if (checkRequest === seenRequest.current) return;
    seenRequest.current = checkRequest;
    if (hidden || !checkOn) return;
    editor.select([]);
    setCheckOpen(true);
    layout.showInspector();
  }, [checkRequest]);
  // The Export check, live: the pill, the badges, the inspector's lines and the panel all read it.
  const check = useMemo(() => checkItems(editor.committed, isImported(editor.open.stored)), [editor.committed, editor.open.stored]);
  const checkState: ExportCheckState = useMemo(() => ({ on: checkOn, byPath: new Map(check.rows.map((r) => [r.path, r])) }), [checkOn, check]);

  // Live needs the Data API: when it is not reachable the toolbar disables it and the editor leaves it.
  useEffect(() => {
    if (!unreachable || editor.sensorMode !== "live") return;
    editor.setSensorMode("unbound");
    toast("Data API not reachable: sensors set to Unbound");
  }, [unreachable, editor.sensorMode]);

  // Live values for the keys the items read, from the shared sensor store (no stream per item).
  const keys = useMemo(() => editKeys(editor.committed), [editor.committed]);
  const live = useSensors(editor.sensorMode === "live" || remapOpen ? keys : []) as unknown as Record<string, DataApiValue>;
  const groupIds = useMemo(() => editor.groups.map((g) => g.id), [editor.groups]);
  const view = useMemo(
    () => sensorView(editor.sensorMode, editor.ctx, groupIds, editor.mock, live),
    [editor.sensorMode, editor.ctx, groupIds, editor.mock, live],
  );

  const remapCount = useMemo(() => {
    if (!online) return 0;
    const counts = filterCounts(remapRows(editor.groups, index, resolveAll(editor.groups, index, editor.overrides), editor.overrides));
    return counts.check + counts.unresolved;
  }, [online, editor.groups, index, editor.overrides]);

  // The editor's keys, in the capture phase so the studio's zone shortcuts never see them.
  const openSave = () => setSaveOpen(true);
  /** Save the selection to the Library as a component (the items, their files and palette, the roles of their sensors). */
  const saveAsComponent = (name: string) => {
    const made = saveComponent({
      stored: editor.open.stored,
      profile: editor.open.profile,
      items: editor.committed,
      selection: editor.selection,
      boxes: editor.boxes,
      name,
      palette: editor.palette,
    });
    if (!made) return toast("Select something to save as a component");
    createLibraryItem(componentItem(made.stored, name, made.roles)).then(
      () => toast(`Saved ${name} as a component in the Library`),
      (e: Error) => toast(`Not saved as a component: ${e.message}`),
    );
  };
  /** A Library component dropped on the canvas: merged at the point as one step, sensors matched by role, one copy counted. */
  const placeComponent = async (item: LibraryItem, at: { x: number; y: number }) => {
    const data = await canvasData(item).catch(() => undefined);
    if (!data) return toast(`${item.name} couldn’t be read from the Library`);
    const { editor: ed } = latest.current;
    const r = withComponent(ed.open.stored, ed.open.profile, ed.committed, data, { at }, { roles: rolesOf(item), sensors });
    ed.commitStored(r.stored, r.paths);
    void recordCopy(item, { profileId, zoneId: ed.zone.id, itemPath: r.paths[0], label: `${ed.open.stored.source.name} › ${item.name}` });
    toast(r.open > 0 ? `Added ${item.name}; ${r.open} sensor${r.open === 1 ? "" : "s"} need a look in Remap` : `Added ${item.name}${r.bound > 0 ? `; ${r.bound} sensor${r.bound === 1 ? "" : "s"} matched by role` : ""}`);
    if (r.open > 0) setRemapOpen(true);
  };
  const latest = useRef({ editor, onDone, hidden, openSave, checkOpen, grid });
  latest.current = { editor, onDone, hidden, openSave, checkOpen, grid };
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || latest.current.hidden) return;
      const action = canvasKeyAction(
        { key: e.key, code: e.code, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, altKey: e.altKey, altGraph: e.getModifierState("AltGraph") },
        { typing: isTyping(document.activeElement), overlay: hasOverlay(), grid: latest.current.grid !== undefined },
      );
      if (!action) return;
      e.preventDefault();
      const { editor: ed, onDone: done, grid: g } = latest.current;
      switch (action.type) {
        case "duplicate":
          return ed.duplicate();
        case "component":
          return ed.selection.length ? latest.current.openSave() : undefined;
        case "group":
          return ed.group();
        case "ungroup":
          return ed.ungroup();
        case "remove":
          return ed.remove();
        case "nudge":
          // A widget stays on its cells: Alt+Arrows moves a selection holding one by a cell.
          if (g && holdsWidget(ed.committed, ed.selection)) return byCells(ed, g, Math.sign(action.dx), Math.sign(action.dy));
          return ed.nudge(action.dx, action.dy);
        case "nudge-cell":
          return g ? byCells(ed, g, action.dx, action.dy) : undefined;
        case "resize-cell":
          return g ? resizeByCell(ed, g, action.dx, action.dy) : undefined;
        case "forward":
          return ed.reorder(1);
        case "backward":
          return ed.reorder(-1);
        case "escape":
          if (latest.current.checkOpen) return setCheckOpen(false);
          return ed.selection.length ? ed.select([]) : done?.();
        case "block":
          return;
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  // The item a grid page's drop or click made this free area for, added once it is open.
  const added = useRef(false);
  useEffect(() => {
    if (added.current || !initialAdd) return;
    added.current = true;
    const entry = paletteEntryOf(initialAdd.data);
    if (entry) onAdd(entry, initialAdd.at ? { at: initialAdd.at } : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The screenshot's object URL goes with the editor.
  const shot = useRef(compare);
  shot.current = compare;
  useEffect(() => () => void (shot.current && URL.revokeObjectURL(shot.current.src)), []);

  const name = editor.open.profile.Name || editor.open.stored.source.name;
  if (hidden) return null;
  const floating = layout.mode === "floating";
  const inspectorBody =
    checkOpen && checkOn ? (
      <ExportCheckPanel
        check={check}
        onSelect={(path) => {
          setCheckOpen(false);
          editor.select([path]);
        }}
        onExport={() => onExport?.()}
      />
    ) : single && widgetHost && isWidgetItem(single) ? (
      <WidgetItemInspector key={editor.selection[0]} editor={editor} path={editor.selection[0]} item={single} host={widgetHost} />
    ) : hasSelection ? (
      <ItemInspector
        editor={editor}
        live={live}
        sensors={sensors}
        onRemap={() => setRemapOpen(true)}
        onBindSensor={single && "SensorType" in single ? (sensor) => editor.bind(editor.selection[0], sensor) : undefined}
        onEditGauge={onEditGauge}
      />
    ) : (
      <ProfileSettings editor={editor} onLayout={freePage ? onLayout : undefined} />
    );
  const inspector = (
    <aside
      aria-label={checkOpen && checkOn ? "Export check" : "Item"}
      className={cn("flex flex-col overflow-y-auto bg-ui-panel font-ui", floating ? "h-full w-full" : "w-[320px] shrink-0 border-l border-ui-subtle")}
    >
      {inspectorBody}
    </aside>
  );
  const drawer = shell.leftOpen && (
    <LeftPanelFrame tab={shell.leftTab} onTab={shell.onLeftTab} width={shell.leftWidth}>
      {shell.leftTab === "layers" ? (
        <ItemsTree editor={editor} name={name} onSaveComponent={openSave} />
      ) : freePage && widgetHost ? (
        <AddPanel
          catalog={catalog}
          recent={recent}
          onClearTarget={() => {}}
          onAdd={(row) => addWidget(row)}
          onRenamePreset={(id, to) => setConfig((c) => renamePanelPreset(c, id, to))}
          onDeletePreset={(id) => setConfig((c) => deletePanelPreset(c, id))}
          density={addDensity}
          previewOnHover={addPreview}
          appearance={widgetHost.appearance}
          free={{
            filter: addFilter,
            onFilter: setAddFilter,
            itemCount: ITEM_COUNT,
            items: (query) => <PaletteGroups onAdd={onAdd} query={query} status={checkOn ? () => <StatusIcon status="ok" /> : undefined} />,
            status: rowStatus && ((row) => {
              const s = rowStatus.get(`${row.kind}:${row.id}`);
              return s ? <StatusIcon status={s} className="h-[11px] w-[11px]" /> : null;
            }),
          }}
        />
      ) : (
        <AddPalette onAdd={onAdd} />
      )}
    </LeftPanelFrame>
  );
  const main = (
    <>
      {shell.pageTabs?.(checkOn ? <ExportCheckPill check={check} open={checkOpen} onClick={toggleCheck} /> : null)}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <CanvasToolbar
          editor={editor}
          history={history}
          showModes={showModes}
          onShowModes={setShowModes}
          compare={compareOn}
          onCompare={setCompareOn}
          remapCount={remapCount}
          onRemap={() => setRemapOpen(true)}
          apiUnreachable={unreachable}
          library={libraryLink}
          onSaveComponent={openSave}
          onDone={onDone}
        />
        {unbound && unbound.length > 0 && (
          <div role="status" className="flex shrink-0 items-center gap-3 border-b border-ui-subtle bg-ui-panel px-4 py-1.5 font-ui text-[12px] text-ui-2">
            <span className="min-w-0 flex-1">
              Not found on this PC, so left unbound: {unbound.join(", ")}.
            </span>
            <button type="button" onClick={() => setRemapOpen(true)} className="h-7 rounded-[7px] border border-ui-default px-2.5 text-ui-1 hover:bg-ui-hover">
              Remap
            </button>
            <button type="button" aria-label="Dismiss" onClick={onDismissUnbound} className="grid h-7 w-7 place-items-center rounded-[7px] text-ui-4 hover:bg-ui-hover hover:text-ui-1">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {showModes && <ModesStrip editor={editor} />}
        {compareOn && <CompareStrip compare={compare} onCompare={setCompare} />}
        <EditCanvas
          editor={editor}
          ctx={view.ctx}
          values={view.values}
          showModes={showModes}
          profileId={profileId}
          compare={compareOn ? compare : null}
          onRefused={toast}
          onCompareFailed={() => setCompare(null)}
          onPlace={onAdd}
          onComponent={(item, at) => void placeComponent(item, at)}
          onOpenSettings={openSettings}
          widgets={widgetHost && { sensors: widgetSensors, appearance: widgetHost.appearance, scope: widgetHost.scope }}
          onPlaceWidget={freePage ? placeWidget : undefined}
          grid={grid}
          snapItems={snapItems}
        />
        <p className="shrink-0 truncate border-t border-ui-subtle bg-ui-panel px-4 py-1.5 font-ui text-[11.5px] text-ui-4">
          {grid ? "Arrows move a cell · Alt+Arrows nudge items 1 px · Ctrl+G group · Ctrl+] forward" : "Drag to move. Arrows nudge 1 px, Shift+arrows 10 px. Hold Alt to stop snapping, Shift to keep one axis or the shape."}
        </p>
      </div>
    </>
  );
  return (
    <ExportCheckContext.Provider value={checkState}>
      <StudioShell layout={layout} rail={shell.rail} railWidth={shell.railWidth} drawer={drawer} main={main} bar={null} inspector={inspector} />
      <RemapDialog
        open={remapOpen}
        onOpenChange={setRemapOpen}
        name={name}
        groups={editor.groups}
        overrides={editor.overrides}
        index={index}
        online={online}
        onOverrides={(next) => editor.applyOverrides(next, index)}
        onSelectItems={editor.select}
      />
      {saveOpen && (
        <SaveComponentDialog
          open
          onOpenChange={setSaveOpen}
          count={componentPaths(editor.committed, editor.selection).length}
          initialName={editor.selection.length === 1 ? (itemAt(editor.committed, editor.selection[0])?.Name ?? "Component") : "Component"}
          onSave={saveAsComponent}
        />
      )}
      <SensorPicker
        open={pickFor !== null}
        onOpenChange={(open) => !open && setPickFor(null)}
        title={`Choose a sensor for ${pickFor?.label ?? "the item"}`}
        pluginOnly={pickFor?.pluginOnly ?? false}
        current={pickTarget ? editKeyOf(pickTarget) : null}
        onPick={(sensor) => pickFor && editor.bind(pickFor.path, sensor, pickFor.fresh ? (item) => namedFor(item, sensor) : undefined)}
      />
      <ImagePicker
        open={fileFor !== null}
        onOpenChange={(open) => !open && setFileFor(null)}
        title={`Choose an image for ${fileFor?.entry.label ?? "the item"}`}
        onPick={(file) => {
          if (!fileFor) return;
          const path = editor.addWithFile(newItem(fileFor.entry.kind, editor.open.profile, editor.palette), file, fileFor.place);
          askSensor(fileFor.entry, path);
        }}
      />
    </ExportCheckContext.Provider>
  );
}

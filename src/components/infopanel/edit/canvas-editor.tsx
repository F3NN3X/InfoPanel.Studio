/**
 * The InfoPanel editor (A5, spec §7), the body of the studio's InfoPanel page: on the left the
 * Add palette with Layers (the item tree) below it, 256 px; the toolbar and canvas; and the
 * inspector (308 px), which shows the profile's settings when nothing is selected. It edits one
 * canvas zone's stored form, and every edit goes through the studio's history, so undo, redo and
 * auto-save work as anywhere in the studio. Lazy-loaded: the InfoPanel model stays out of the
 * studio's first bundle.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import type { HistorySetter } from "@/hooks/use-config-history";
import { useToast } from "@/components/ui/toast";
import { useSensors } from "@/hooks/useSensors";
import { useSensorCatalog } from "@/lib/catalog";
import { editKeyOf } from "@/lib/infopanel/canvas-edit";
import { namedFor, newItem, PALETTE, type PaletteEntry } from "@/lib/infopanel/editor/create";
import type { DropPlace } from "@/lib/infopanel/canvas-edit";
import { itemAt } from "@/lib/infopanel/editor/ops";
import type { Placement } from "@/lib/layout";
import { filterCounts, remapRows, resolveAll } from "@/lib/infopanel/remap/remap";
import { keptScreenshot } from "@/lib/infopanel/canvas";
import { editKeys, sensorView } from "@/lib/infopanel/canvas-edit";
import type { Path } from "@/lib/infopanel/editor/ops";
import type { StoredCanvas } from "@/lib/infopanel/import/stored";
import type { DataApiValue } from "@/lib/infopanel/sensors";
import { useViewportBelow } from "@/hooks/use-viewport-below";
import { PaneSheet } from "@/components/studio/pane-sheet";
import { DOCKED_MIN_WIDTH, FLOATING_MIN_WIDTH, type InspectorMode } from "@/components/studio/studio-layout";
import { withCanvas } from "@/components/studio/import-actions";
import { RemapDialog, useRemapIndex } from "../remap-dialog";
import { AddPalette } from "./add-palette";
import { canvasKeyAction } from "./canvas-keys";
import { CanvasToolbar, CompareStrip, ModesStrip } from "./canvas-toolbar";
import { EditCanvas, type Compare } from "./edit-canvas";
import { ImagePicker } from "./image-picker";
import { ItemInspector } from "./item-inspector";
import { ItemsTree } from "./items-tree";
import { ProfileSettings } from "./profile-settings";
import { SensorPicker } from "./sensor-picker";
import { useCanvasEditor } from "./use-canvas-editor";

export interface CanvasEditorProps {
  zone: Placement & { canvas: StoredCanvas };
  setConfig: HistorySetter;
  history: { canUndo: boolean; canRedo: boolean; undo: () => void; redo: () => void };
  onDone: () => void;
  /** The Library page covers the editor: it stays mounted but its keys do nothing. */
  hidden?: boolean;
  /** The active profile (a dropped Library image is recorded as a copy there). */
  profileId: string;
  /** Items selected on open (the Library's "uses", a font's text items). */
  initialSelection?: string[];
  /** A Gauge item's "Edit gauge…": open it in Gauges. */
  onEditGauge?: (path: Path) => void;
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

/** InfoPanel lists only plugin sensors for these. */
const PLUGIN_ONLY = new Set(["TableSensor", "HttpImage"]);

const hasOverlay = () => document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]') !== null;

export default function CanvasEditorView({ zone, setConfig, history, onDone, hidden = false, profileId, initialSelection, onEditGauge }: CanvasEditorProps) {
  const editor = useCanvasEditor(zone, setConfig, withCanvas, initialSelection);
  const toast = useToast();
  const [showModes, setShowModes] = useState(false);
  const [compareOn, setCompareOn] = useState(false);
  // The screenshot the canvas kept at import is Compare's start; "choose another" replaces it.
  const [compare, setCompare] = useState<Compare | null>(() => keptScreenshot(zone.canvas));
  const [remapOpen, setRemapOpen] = useState(false);
  const { index, online, unreachable } = useRemapIndex();
  const sensors = useSensorCatalog().sensors as unknown as Record<string, DataApiValue>;
  const [pickFor, setPickFor] = useState<PickFor | null>(null);
  const [fileFor, setFileFor] = useState<{ entry: PaletteEntry; place?: DropPlace } | null>(null);
  /** An Add palette click or drop: the kind with its new-item look, selected; a sensor kind asks for its sensor. */
  const askSensor = (entry: PaletteEntry, path: Path) => {
    if (entry.sensor) setPickFor({ path, label: entry.label, pluginOnly: entry.pluginOnly === true, fresh: true });
  };
  const onAdd = (entry: PaletteEntry, place?: DropPlace) => {
    if (entry.file) return setFileFor({ entry, place });
    askSensor(entry, editor.add(newItem(entry.kind, editor.open.profile), place));
  };
  const single = editor.selection.length === 1 ? itemAt(editor.committed, editor.selection[0]) : undefined;
  const pickTarget = pickFor ? itemAt(editor.committed, pickFor.path) : undefined;
  // The studio inspector's modes (docked column, floating card, bottom sheet) on the studio's viewport
  // breakpoints, not the editor's own width: that changes when the inspector docks, which flipped the mode back.
  const belowDocked = useViewportBelow(DOCKED_MIN_WIDTH);
  const belowFloating = useViewportBelow(FLOATING_MIN_WIDTH);
  const mode: InspectorMode = !belowDocked ? "docked" : !belowFloating ? "floating" : "sheet";
  // The floating card opens with a selection; closing it holds until the selection changes.
  const selectionKey = editor.selection.join("\n");
  const [closedFor, setClosedFor] = useState<string | null>(null);
  const hasSelection = editor.selection.length > 0;
  const floatOpen = hasSelection && closedFor !== selectionKey;

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
  const latest = useRef({ editor, onDone, hidden });
  latest.current = { editor, onDone, hidden };
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || latest.current.hidden) return;
      const action = canvasKeyAction(
        { key: e.key, code: e.code, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, altKey: e.altKey, altGraph: e.getModifierState("AltGraph") },
        { typing: isTyping(document.activeElement), overlay: hasOverlay() },
      );
      if (!action) return;
      e.preventDefault();
      const { editor: ed, onDone: done } = latest.current;
      switch (action.type) {
        case "duplicate":
          return ed.duplicate();
        case "group":
          return ed.group();
        case "ungroup":
          return ed.ungroup();
        case "remove":
          return ed.remove();
        case "nudge":
          return ed.nudge(action.dx, action.dy);
        case "escape":
          return ed.selection.length ? ed.select([]) : done();
        case "block":
          return;
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  // The screenshot's object URL goes with the editor.
  const shot = useRef(compare);
  shot.current = compare;
  useEffect(() => () => void (shot.current && URL.revokeObjectURL(shot.current.src)), []);

  const name = editor.open.profile.Name || editor.open.stored.source.name;
  const inspector = hasSelection ? (
    <ItemInspector
      editor={editor}
      live={live}
      sensors={sensors}
      onRemap={() => setRemapOpen(true)}
      onPickSensor={
        single && "SensorType" in single
          ? () => setPickFor({ path: editor.selection[0], label: single.Name || single.kind, pluginOnly: PLUGIN_ONLY.has(single.kind), fresh: false })
          : undefined
      }
      onEditGauge={onEditGauge}
    />
  ) : (
    <ProfileSettings editor={editor} />
  );
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 bg-ui-app">
      <aside aria-label="Add and layers" className="flex w-64 shrink-0 flex-col overflow-y-auto border-r border-ui-subtle bg-ui-panel">
        <AddPalette onAdd={onAdd} />
        <ItemsTree editor={editor} name={name} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
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
          onDone={onDone}
        />
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
          onPlace={(kind, place) => {
            const entry = PALETTE.find((p) => p.kind === kind);
            if (entry) onAdd(entry, place);
          }}
        />
        <p className="shrink-0 truncate border-t border-ui-subtle bg-ui-panel px-4 py-1.5 font-ui text-[11.5px] text-ui-4">
          Drag to move. Arrows nudge 1 px, Shift+arrows 10 px. Hold Alt to stop snapping, Shift to keep one axis or the shape.
        </p>
      </div>
      {mode === "docked" && (
        <aside aria-label="Item" className="flex w-[308px] shrink-0 flex-col overflow-y-auto border-l border-ui-subtle bg-ui-panel">
          {inspector}
        </aside>
      )}
      {mode === "floating" && floatOpen && (
        <aside
          aria-label="Item"
          className="absolute bottom-3 right-3 top-3 z-40 flex w-[320px] flex-col overflow-y-auto rounded-xl border border-ui-strong bg-ui-panel shadow-[0_16px_40px_rgba(0,0,0,.5)]"
        >
          <div className="flex shrink-0 justify-end px-2 pt-2">
            <button
              type="button"
              aria-label="Close"
              onClick={() => setClosedFor(selectionKey)}
              className="flex h-7 w-7 items-center justify-center rounded-[7px] text-ui-3 hover:bg-ui-hover hover:text-ui-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {inspector}
        </aside>
      )}
      {mode === "sheet" && hasSelection && (
        <PaneSheet label="Item" onClose={() => editor.select([])}>
          <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">{inspector}</div>
        </PaneSheet>
      )}
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
          const path = editor.addWithFile(newItem(fileFor.entry.kind, editor.open.profile), file, fileFor.place);
          askSensor(fileFor.entry, path);
        }}
      />
    </div>
  );
}

/**
 * The canvas zone editor (A5, spec §7), in place of the studio's canvas while it is open: the
 * items tree (256 px), the toolbar and canvas, and the item inspector (308 px). Every edit is a
 * change to the zone's stored form through the studio's history, so undo, redo and auto-save
 * work as anywhere in the studio. Lazy-loaded: the InfoPanel model stays out of the studio's
 * first bundle.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { HistorySetter } from "@/hooks/use-config-history";
import { useToast } from "@/components/ui/toast";
import { useSensors } from "@/hooks/useSensors";
import type { Placement } from "@/lib/layout";
import { filterCounts, remapRows, resolveAll } from "@/lib/infopanel/remap/remap";
import { editKeys, sensorView } from "@/lib/infopanel/canvas-edit";
import type { Path } from "@/lib/infopanel/editor/ops";
import type { StoredCanvas } from "@/lib/infopanel/import/stored";
import type { DataApiValue } from "@/lib/infopanel/sensors";
import { withCanvas } from "@/components/studio/import-actions";
import { RemapDialog, useRemapIndex } from "../remap-dialog";
import { canvasKeyAction } from "./canvas-keys";
import { CanvasToolbar, CompareStrip, ModesStrip } from "./canvas-toolbar";
import { EditCanvas, type Compare } from "./edit-canvas";
import { ItemInspector } from "./item-inspector";
import { ItemsTree } from "./items-tree";
import { useCanvasEditor } from "./use-canvas-editor";

export interface CanvasEditorProps {
  zone: Placement & { canvas: StoredCanvas };
  setConfig: HistorySetter;
  history: { canUndo: boolean; canRedo: boolean; undo: () => void; redo: () => void };
  onDone: () => void;
  /** Items selected on open (the Library's "uses", a font's text items). */
  initialSelection?: string[];
  /** A Gauge item's "Edit gauge…": open it in the Gauges page. */
  onEditGauge?: (path: Path) => void;
}

const isTyping = (el: Element | null) =>
  el instanceof HTMLElement && (el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");
const hasOverlay = () => document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]') !== null;

export default function CanvasEditorView({ zone, setConfig, history, onDone, initialSelection, onEditGauge }: CanvasEditorProps) {
  const editor = useCanvasEditor(zone, setConfig, withCanvas, initialSelection);
  const toast = useToast();
  const [showModes, setShowModes] = useState(false);
  const [compareOn, setCompareOn] = useState(false);
  const [compare, setCompare] = useState<Compare | null>(null);
  const [remapOpen, setRemapOpen] = useState(false);
  const { index, online } = useRemapIndex();

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
  const latest = useRef({ editor, onDone });
  latest.current = { editor, onDone };
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
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

  const name = editor.open.stored.source.name;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 bg-ui-app">
      <ItemsTree editor={editor} name={name} />
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
          onDone={onDone}
        />
        {showModes && <ModesStrip editor={editor} />}
        {compareOn && <CompareStrip compare={compare} onCompare={setCompare} />}
        <EditCanvas editor={editor} ctx={view.ctx} values={view.values} showModes={showModes} compare={compareOn ? compare : null} onRefused={toast} />
      </div>
      <aside aria-label="Item" className="flex w-[308px] shrink-0 flex-col overflow-y-auto border-l border-ui-subtle bg-ui-panel">
        <ItemInspector editor={editor} live={live} onRemap={() => setRemapOpen(true)} onEditGauge={onEditGauge} />
      </aside>
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
    </div>
  );
}

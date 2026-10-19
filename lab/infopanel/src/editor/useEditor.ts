/**
 * The lab editor's state: the item tree with undo history, a transient preview
 * while a drag runs (committed once at the end, so one drag is one undo step),
 * and the selection.
 */
import { useCallback, useEffect, useState } from "react";
import type { AssetTable, Doc } from "@/lib/infopanel/assets/assets.ts";
import type { DisplayItem } from "@/lib/infopanel/schema.ts";
import { commit, redo, start, undo, type History } from "@/lib/infopanel/editor/history.ts";
import { duplicate, group, itemAt, moveBy, removeAll, reorder, setField, ungroup, type Path } from "@/lib/infopanel/editor/ops.ts";

export interface Editor {
  /** What to draw: the preview while a drag runs, else the present. */
  items: DisplayItem[];
  present: DisplayItem[];
  /** The profile's asset files (L6); in the same history as the items. */
  assets: AssetTable;
  selection: Path[];
  canUndo: boolean;
  canRedo: boolean;
  select(paths: Path[]): void;
  /** Click selection: `additive` toggles the path in the selection. */
  pick(path: Path, additive: boolean): void;
  apply(next: DisplayItem[], selection?: Path[]): void;
  /** Commits items and assets together, as one undo step. */
  applyDoc(next: Doc): void;
  preview(next: DisplayItem[] | null): void;
  set(path: Path, field: string, value: unknown): void;
  undo(): void;
  redo(): void;
  remove(): void;
  duplicate(): void;
  group(): void;
  ungroup(): void;
  reorder(step: -1 | 1): void;
  nudge(dx: number, dy: number): void;
}

/** Shortcuts never fire while typing in a field. */
export const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(t.tagName));

const NO_ASSETS: AssetTable = new Map();

export function useEditor(initial: DisplayItem[], initialAssets: AssetTable = NO_ASSETS): Editor {
  const [history, setHistory] = useState<History<Doc>>(() => start({ items: initial, assets: initialAssets }));
  const [preview, setPreview] = useState<DisplayItem[] | null>(null);
  const [selection, setSelection] = useState<Path[]>([]);
  const present = history.present.items;
  // Selections that no longer resolve (after undo, say) are dropped.
  const valid = selection.filter((p) => itemAt(present, p));

  const apply = useCallback((next: DisplayItem[], sel?: Path[]) => {
    setPreview(null);
    setHistory((h) => (next === h.present.items ? h : commit(h, { ...h.present, items: next })));
    if (sel) setSelection(sel);
  }, []);
  const applyDoc = useCallback((next: Doc) => {
    setPreview(null);
    setHistory((h) => (next.items === h.present.items && next.assets === h.present.assets ? h : commit(h, next)));
  }, []);

  const editor: Editor = {
    items: preview ?? present,
    present,
    assets: history.present.assets,
    selection: valid,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    select: setSelection,
    pick: (path, additive) =>
      setSelection((s) => (additive ? (s.includes(path) ? s.filter((p) => p !== path) : [...s, path]) : [path])),
    apply,
    applyDoc,
    preview: setPreview,
    set: (path, field, value) => apply(setField(present, path, field, value)),
    undo: () => setHistory(undo),
    redo: () => setHistory(redo),
    remove: () => valid.length && apply(removeAll(present, valid), []),
    duplicate: () => {
      if (!valid.length) return;
      const r = duplicate(present, valid);
      apply(r.items, r.paths);
    },
    group: () => {
      const r = group(present, valid);
      if (r) apply(r.items, [r.path]);
    },
    ungroup: () => {
      const r = valid.length === 1 ? ungroup(present, valid[0]) : null;
      if (r) apply(r.items, r.paths);
    },
    reorder: (step) => {
      if (valid.length !== 1) return;
      const r = reorder(present, valid[0], step);
      apply(r.items, [r.path]);
    },
    nudge: (dx, dy) => {
      const movable = valid.filter((p) => !itemAt(present, p)?.IsLocked);
      if (movable.length) apply(moveBy(present, movable, dx, dy));
    },
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      const step = e.shiftKey ? 10 : 1;
      const arrows: Record<string, [number, number]> = { arrowleft: [-step, 0], arrowright: [step, 0], arrowup: [0, -step], arrowdown: [0, step] };
      let handled = true;
      if (mod && k === "z" && !e.shiftKey) editor.undo();
      else if (mod && (k === "y" || (k === "z" && e.shiftKey))) editor.redo();
      else if (mod && k === "d") editor.duplicate();
      else if (mod && k === "g" && e.shiftKey) editor.ungroup();
      else if (mod && k === "g") editor.group();
      else if (k === "delete" || k === "backspace") editor.remove();
      else if (k === "escape") editor.select([]);
      else if (arrows[k] && valid.length) editor.nudge(...arrows[k]);
      else handled = false;
      if (handled) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return editor;
}

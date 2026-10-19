import { uid, type PanelDef, type Placement, type Widget, type WidgetKind } from "@/lib/layout";
import { convertKind, duplicateWidget, insertAfter, moveWidget, normalizeWidget } from "@/lib/panel-model";

/** What the widget actions read and drive (the studio owns the selection). */
export interface PanelWidgetDeps {
  /** A panel placement. */
  placement: Placement;
  /** Mutate the placement; field edits pass a key, structural edits none. */
  update: (fn: (p: Placement) => Placement, key?: string) => void;
  selectedWidgetId: string | null;
  onSelectWidget: (id: string | null) => void;
  /** The widget copied with "Copy" (session only, shared across panels). */
  widgetClipboard: Widget | null;
  onCopyWidget: (widget: Widget) => void;
  /** New widget ids (tests pass a counter). */
  newId?: () => string;
}

/** The widget to select once `id` is removed: the next one, else the previous, else none. */
export function selectionAfterRemove(widgets: Widget[], id: string): string | null {
  const i = widgets.findIndex((w) => w.id === id);
  if (i < 0) return null;
  const rest = widgets.filter((w) => w.id !== id);
  return rest[Math.min(i, rest.length - 1)]?.id ?? null;
}

/**
 * The panel's widget edits, shared by the inspector (layers, menus) and
 * the studio's canvas keys / command palette. Each structural edit is one
 * undo step and selects the widget it leaves behind.
 */
export function panelWidgetActions(d: PanelWidgetDeps) {
  const panel = d.placement.panel!;
  const newId = d.newId ?? (() => uid("w"));

  const updatePanel = (fn: (p: PanelDef) => PanelDef, key?: string) =>
    d.update((p) => ({ ...p, panel: fn(p.panel!) }), key);

  const updateWidget = (id: string, fn: (w: Widget) => Widget, field?: string) =>
    updatePanel(
      (p) => ({ ...p, widgets: p.widgets.map((w) => (w.id === id ? fn(w) : w)) }),
      field && `panel-widget:${id}:${field}`
    );

  /** Insert after the selected widget (or at the end) and select it. */
  const insert = (w: Widget) => {
    updatePanel((p) => insertAfter(p, d.selectedWidgetId, w));
    d.onSelectWidget(w.id);
  };

  const duplicate = (id: string) => {
    const copyId = newId();
    updatePanel((p) => duplicateWidget(p, id, copyId));
    d.onSelectWidget(copyId);
  };

  const copy = (id: string) => {
    const w = panel.widgets.find((x) => x.id === id);
    if (w) d.onCopyWidget(w);
  };

  /** Paste the copied widget (under a new id, brought up to the current model) after `afterId`. */
  const paste = (afterId: string | null) => {
    if (!d.widgetClipboard) return;
    const w = normalizeWidget({ ...d.widgetClipboard, id: newId() });
    updatePanel((p) => insertAfter(p, afterId, w));
    d.onSelectWidget(w.id);
  };

  const remove = (id: string) => {
    updatePanel((p) => ({ ...p, widgets: p.widgets.filter((w) => w.id !== id) }));
    if (d.selectedWidgetId === id) d.onSelectWidget(selectionAfterRemove(panel.widgets, id));
  };

  /** Move a widget so it ends up at `index`. */
  const move = (id: string, index: number) => updatePanel((p) => moveWidget(p, id, index));

  /** Move a widget one place earlier (-1) or later (1); a no-op at the ends. */
  const step = (id: string, delta: -1 | 1) => {
    const i = panel.widgets.findIndex((w) => w.id === id);
    const to = i + delta;
    if (i >= 0 && to >= 0 && to < panel.widgets.length) move(id, to);
  };

  const changeKind = (id: string, kind: WidgetKind) => updateWidget(id, (w) => convertKind(w, kind));

  return { updatePanel, updateWidget, insert, duplicate, copy, paste, remove, move, step, changeKind };
}

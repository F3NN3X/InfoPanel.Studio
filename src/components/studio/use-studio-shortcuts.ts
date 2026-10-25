import { useEffect, useRef } from "react";

/** What a studio keyboard shortcut does. */
export type ShortcutAction =
  | { type: "remove" }
  | { type: "duplicate" }
  | { type: "toggle-visible" }
  | { type: "select-all" }
  | { type: "copy-style" }
  | { type: "paste-style" }
  | { type: "escape" }
  | { type: "nudge"; cols: number; rows: number }
  | { type: "resize"; cols: number; rows: number }
  | { type: "save" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "zoom-fit" }
  | { type: "zoom-in" }
  | { type: "zoom-out" }
  | { type: "palette" }
  | { type: "settings" }
  | { type: "toggle-dock" }
  | { type: "cheatsheet" }
  | { type: "page-next" }
  | { type: "page-prev" }
  | { type: "widget-remove" }
  | { type: "widget-duplicate" }
  | { type: "widget-copy" }
  | { type: "widget-paste" }
  | { type: "widget-move"; delta: -1 | 1 }
  | { type: "toggle-preview" }
  | { type: "refresh-preview" };

/** The parts of a keydown event the mapping reads. */
export interface KeyInput {
  key: string;
  /** The physical key (Alt changes `key` on some layouts, so Ctrl+Alt+C / V read this). */
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  /** AltGr is down (Ctrl+Alt on some layouts): a typed character, not a chord. */
  altGraph?: boolean;
}

export interface ShortcutContext {
  /** Focus is in a text field, select or contenteditable. */
  typing: boolean;
  /** A dialog or menu is open (it handles its own keys). */
  overlay: boolean;
  /**
   * A panel widget is selected: Del, Ctrl+D, Ctrl+C / Ctrl+V and
   * Alt+↑/↓ act on it (the arrows still move the zone).
   */
  widget?: boolean;
  /** A pointer drag is in flight: only Esc (the drag's own cancel) is left alive. */
  dragging?: boolean;
}

const ARROWS: Record<string, { cols: number; rows: number }> = {
  ArrowLeft: { cols: -1, rows: 0 },
  ArrowRight: { cols: 1, rows: 0 },
  ArrowUp: { cols: 0, rows: -1 },
  ArrowDown: { cols: 0, rows: 1 },
};

/** Ctrl/cmd shortcuts (meta counts as ctrl). */
function commandAction(e: KeyInput): ShortcutAction | null {
  const key = e.key.toLowerCase();
  if (key === "pagedown") return { type: "page-next" };
  if (key === "pageup") return { type: "page-prev" };
  if (key === "s") return { type: "save" };
  if (key === "z") return e.shiftKey ? { type: "redo" } : { type: "undo" };
  if (key === "y") return { type: "redo" };
  if (key === "k") return { type: "palette" };
  if (key === ",") return { type: "settings" };
  if (key === "\\") return { type: "toggle-dock" };
  if (key === "d") return { type: "duplicate" };
  if (key === "a" && !e.shiftKey) return { type: "select-all" };
  if (key === "0") return { type: "zoom-fit" };
  if (key === "=" || key === "+") return { type: "zoom-in" };
  if (key === "-" || key === "_") return { type: "zoom-out" };
  return null;
}

/** With a widget selected, these act on it instead of the zone. */
const WIDGET_SCOPED: Partial<Record<ShortcutAction["type"], ShortcutAction>> = {
  remove: { type: "widget-remove" },
  duplicate: { type: "widget-duplicate" },
};

/** Ctrl/cmd shortcuts on the selected widget (null = not one). */
function widgetCommand(e: KeyInput): ShortcutAction | null {
  const key = e.key.toLowerCase();
  if (key === "c" && !e.shiftKey) return { type: "widget-copy" };
  if (key === "v" && !e.shiftKey) return { type: "widget-paste" };
  return null;
}

/** Ctrl/cmd shortcuts that stay live in text fields and dialogs (undo / redo stay a text field's own while typing). */
const ALWAYS_LIVE = new Set<ShortcutAction["type"]>(["save", "undo", "redo"]);

/**
 * Map a key press to a studio action, or null to leave it alone. Plain
 * keys (and Esc) are ignored while typing or while a dialog/menu is open;
 * Ctrl+S and Ctrl+K work while typing, and Ctrl+S / undo / redo even with a
 * dialog open (Esc is the dialog's). Undo / redo in a text field are the
 * browser's own. While a drag is in flight everything is ignored.
 * With `ctx.widget`, the widget keys (see `ShortcutContext.widget`) act
 * on the selected panel widget.
 */
export function shortcutAction(e: KeyInput, ctx: ShortcutContext): ShortcutAction | null {
  if (ctx.dragging) return null;
  const action = zoneAction(e, ctx);
  if (!ctx.widget || ctx.typing || ctx.overlay) return action;
  if (action) return WIDGET_SCOPED[action.type] ?? action;
  if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
    if (e.key === "ArrowUp") return { type: "widget-move", delta: -1 };
    if (e.key === "ArrowDown") return { type: "widget-move", delta: 1 };
  }
  return e.ctrlKey || e.metaKey ? widgetCommand(e) : null;
}

/** Ctrl/cmd+Alt+C / V: copy / paste the zone's style (by `code`, not `key`). */
function styleAction(e: KeyInput): ShortcutAction | null {
  if (e.shiftKey || e.altGraph) return null;
  if (e.code === "KeyC") return { type: "copy-style" };
  if (e.code === "KeyV") return { type: "paste-style" };
  return null;
}

/** `shortcutAction` without a selected widget. */
function zoneAction(e: KeyInput, ctx: ShortcutContext): ShortcutAction | null {
  if (e.altKey) {
    const action = e.ctrlKey || e.metaKey ? styleAction(e) : null;
    return action && !ctx.typing && !ctx.overlay ? action : null;
  }
  if (e.ctrlKey || e.metaKey) {
    const action = commandAction(e);
    if (!action) return null;
    if (action.type === "undo" || action.type === "redo") return ctx.typing ? null : action;
    if (ALWAYS_LIVE.has(action.type)) return action;
    if (action.type === "palette" || action.type === "settings") return ctx.overlay ? null : action;
    return ctx.typing || ctx.overlay ? null : action;
  }
  if (ctx.typing || ctx.overlay) return null;
  if (e.key === "Escape") return { type: "escape" };
  if (e.key === "Delete" || e.key === "Backspace") return { type: "remove" };
  if (e.key === "h" || e.key === "H") return e.shiftKey ? null : { type: "toggle-visible" };
  if (e.key === "?") return { type: "cheatsheet" };
  if (e.key === "f" || e.key === "F") return e.shiftKey ? { type: "refresh-preview" } : { type: "toggle-preview" };
  if (e.key === "+" || e.key === "=") return { type: "zoom-in" };
  if (e.key === "-") return { type: "zoom-out" };
  const arrow = ARROWS[e.key];
  if (arrow) return { type: e.shiftKey ? "resize" : "nudge", ...arrow };
  return null;
}

/** Shortcut hints for tooltips and the cheat sheet. */
export const KEYS = {
  undo: "Ctrl+Z",
  redo: "Ctrl+Shift+Z",
  save: "Ctrl+S",
  palette: "Ctrl+K",
  settings: "Ctrl+,",
  duplicate: "Ctrl+D",
  copyStyle: "Ctrl+Alt+C",
  pasteStyle: "Ctrl+Alt+V",
  selectAll: "Ctrl+A",
  remove: "Del",
  copy: "Ctrl+C",
  paste: "Ctrl+V",
  reorder: "Alt+↑ / ↓",
  hide: "H",
  deselect: "Esc",
  fit: "Ctrl+0",
  zoomIn: "+",
  zoomOut: "-",
  dock: "Ctrl+\\",
  cheatsheet: "?",
  nextPage: "Ctrl+PageDown",
  prevPage: "Ctrl+PageUp",
  togglePreview: "F",
  refreshPreview: "Shift+F",
} as const;

/** Every shortcut, grouped, for the cheat-sheet dialog. */
export const SHORTCUT_GROUPS: { title: string; items: { keys: string; label: string }[] }[] = [
  {
    title: "General",
    items: [
      { keys: KEYS.palette, label: "Command palette" },
      { keys: KEYS.settings, label: "Settings" },
      { keys: KEYS.save, label: "Save" },
      { keys: KEYS.undo, label: "Undo" },
      { keys: `${KEYS.redo} / Ctrl+Y`, label: "Redo" },
      { keys: KEYS.cheatsheet, label: "Keyboard shortcuts" },
      { keys: KEYS.deselect, label: "Close a menu or dialog, then clear search, step out (widget → zone → none)" },
      { keys: "Ctrl+Enter", label: "Apply the panel JSON (inside the code editor)" },
    ],
  },
  {
    title: "Selected zones",
    items: [
      { keys: "Shift / Ctrl+click", label: "Add to or remove from the selection" },
      { keys: KEYS.selectAll, label: "Select all zones" },
      { keys: "← ↑ → ↓", label: "Move the selection one cell" },
      { keys: "Shift+← / →", label: "Narrower / wider (the primary zone)" },
      { keys: "Shift+↑ / ↓", label: "Shorter / taller (the primary zone)" },
      { keys: KEYS.duplicate, label: "Duplicate" },
      { keys: KEYS.hide, label: "Hide / show" },
      { keys: KEYS.copyStyle, label: "Copy the primary zone's style" },
      { keys: KEYS.pasteStyle, label: "Paste the style onto the selection" },
      { keys: `${KEYS.remove} / Backspace`, label: "Remove" },
    ],
  },
  {
    title: "Selected panel widget",
    items: [
      { keys: "Click / double-click", label: "Select a widget in the zone" },
      { keys: `${KEYS.remove} / Backspace`, label: "Remove the widget" },
      { keys: KEYS.duplicate, label: "Duplicate" },
      { keys: KEYS.copy, label: "Copy" },
      { keys: KEYS.paste, label: "Paste after it" },
      { keys: KEYS.reorder, label: "Move earlier / later" },
      { keys: "← ↑ → ↓", label: "Move the zone (Shift: resize)" },
    ],
  },
  {
    title: "Canvas",
    items: [
      { keys: KEYS.fit, label: "Fit to width" },
      { keys: KEYS.togglePreview, label: "Freeze the preview data / go live (this session)" },
      { keys: KEYS.refreshPreview, label: "Refresh the frozen snapshot" },
      { keys: `${KEYS.zoomIn} / Ctrl+=`, label: "Zoom in" },
      { keys: `${KEYS.zoomOut} / Ctrl+-`, label: "Zoom out" },
      { keys: "Ctrl+wheel", label: "Zoom" },
      { keys: "Space+drag / middle-drag", label: "Pan the canvas (Fit puts it back)" },
      { keys: KEYS.dock, label: "Show / hide the inspector" },
    ],
  },
  {
    title: "Pages",
    items: [
      { keys: KEYS.nextPage, label: "Next page (wraps)" },
      { keys: KEYS.prevPage, label: "Previous page (wraps)" },
      { keys: "Double-click a tab", label: "Rename the page" },
      { keys: "Drag a tab", label: "Reorder the pages" },
    ],
  },
  {
    title: "InfoPanel editor",
    items: [
      { keys: "Arrows", label: "Nudge 1 px" },
      { keys: "Shift+Arrows", label: "Nudge 10 px" },
      { keys: "Alt+drag", label: "Move or resize without snapping" },
      { keys: "Shift+drag", label: "Move on one axis; resize keeping the shape" },
      { keys: KEYS.duplicate, label: "Duplicate" },
      { keys: "Ctrl+G", label: "Group" },
      { keys: "Ctrl+Shift+G", label: "Ungroup" },
      { keys: "Ctrl+Shift+S", label: "Save as component" },
      { keys: `${KEYS.remove} / Backspace`, label: "Delete" },
      { keys: KEYS.deselect, label: "Clear the selection, then leave the editor" },
    ],
  },
];

/** Whether keys typed now go to a form field. */
function isTyping(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return (
    el.isContentEditable ||
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT"
  );
}

/** Whether a dialog or menu is open over the studio. */
function hasOverlay(): boolean {
  return document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]') !== null;
}

/**
 * Studio keyboard shortcuts on the window (see `shortcutAction`). The
 * handler always sees the latest `onAction` and `widget` (a panel widget
 * is selected); `dragging` says whether a pointer drag is in flight.
 */
export function useStudioShortcuts(
  onAction: (action: ShortcutAction) => void,
  widget = false,
  dragging: () => boolean = () => false
) {
  const handler = useRef(onAction);
  handler.current = onAction;
  const widgetRef = useRef(widget);
  widgetRef.current = widget;
  const draggingRef = useRef(dragging);
  draggingRef.current = dragging;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const action = shortcutAction(
        {
          key: e.key,
          code: e.code,
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
          shiftKey: e.shiftKey,
          altKey: e.altKey,
          altGraph: e.getModifierState("AltGraph"),
        },
        {
          dragging: draggingRef.current(),
          typing: isTyping(document.activeElement),
          overlay: hasOverlay(),
          widget: widgetRef.current,
        }
      );
      if (!action) return;
      e.preventDefault();
      handler.current(action);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

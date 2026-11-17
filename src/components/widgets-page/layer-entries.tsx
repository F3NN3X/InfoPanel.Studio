// The layer menu's rows (builder plan Phase 2), one list for Layers' right-click and the stage's: the same commands on the same
// selection wherever the menu opens. Each row runs a `LayerCommand` on the row it opened on (the selection, when that row is in it).
// Phase 4: "Move to" lists the containers (a refused one greyed, with its reason) and "Select" picks the parent or the children.
// Phase 5: "Layer" sets a block as its container's background (or takes it out) and moves it in the drawing order, a flyout of its own
// so the keyboard walk of the menu's rows stays as it was.
import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpLeft, BringToFront, ChevronDown, ChevronUp, ClipboardPaste, Layers2, SendToBack, Wallpaper, Columns3, Copy, CopyPlus, Eye, EyeOff, FolderInput, Grid2x2, LayoutPanelTop, ListTree, Lock, LockOpen, MousePointer2, Paintbrush, Pencil, Scissors, SquareDashed, Trash2 } from "lucide-react";
import type { ContextMenuEntry } from "@/components/ui/context-menu";

/** What the layer menu and its keys do to a row (the selection, when the row is in it). */
export type LayerCommand =
  | "duplicate"
  | "copy"
  | "cut"
  | "paste"
  | "copy-style"
  | "paste-style"
  | "wrap"
  | "wrap-card"
  | "wrap-grid"
  | "unwrap"
  | "up"
  | "down"
  | "out"
  | "in"
  | "select-parent"
  | "select-children"
  | "background"
  | "foreground"
  | "forward"
  | "backward"
  | "front"
  | "back"
  | "delete";

/** A container "Move to" offers (Phase 4): its path, its name with the ones holding it, and why the selection can't go in it. */
export interface MoveTarget {
  path: number[];
  label: string;
  why?: string;
}

/** What the editor alone keeps of a block (G25). */
export type EditorFlag = "hidden" | "locked";

export interface LayerEntriesOf {
  /** The row the menu opened on (`[]` the root card). */
  at: number[];
  /** How many blocks it acts on (the selection's top-level ones when the row is in it). */
  many: number;
  /** The row's block holds blocks (it may unwrap). */
  container: boolean;
  hidden: boolean;
  locked: boolean;
  canPaste: boolean;
  canPasteStyle: boolean;
  /** The row's block holds blocks now (Select children). */
  hasChildren: boolean;
  /** The row's block is its container's background (Phase 5). */
  background?: boolean;
  /** The containers "Move to" lists (`moveTargets`). */
  targets: readonly MoveTarget[];
  onCommand: (cmd: LayerCommand, at: number[]) => void;
  /** The row (the selection, when the row is in it) moved to the end of the container at `toParent`. */
  onMoveTo: (at: number[], toParent: number[]) => void;
  onRename: (at: number[]) => void;
  onFlag: (flag: EditorFlag, at: number[], on: boolean) => void;
}

/** The layer menu's rows for the row `at`. The root card takes only Paste. */
export function layerEntries({ at, many, container, hidden, locked, canPaste, canPasteStyle, hasChildren, background, targets, onCommand, onMoveTo, onRename, onFlag }: LayerEntriesOf): ContextMenuEntry[] {
  const root = at.length === 0;
  const entry = (cmd: LayerCommand, label: string, icon: ReactNode, hint: string | undefined, disabled = root, danger?: boolean): ContextMenuEntry => ({ id: cmd, label, icon, hint, disabled, danger, onSelect: () => onCommand(cmd, at) });
  return [
    { id: "rename", label: "Rename", icon: <Pencil />, hint: "F2", disabled: root || many > 1, onSelect: () => onRename(at) },
    entry("duplicate", "Duplicate", <CopyPlus />, "Ctrl+D"),
    { id: "hide", label: hidden ? "Show on the stage" : "Hide on the stage", icon: hidden ? <Eye /> : <EyeOff />, hint: "Ctrl+Shift+H", disabled: root, onSelect: () => onFlag("hidden", at, !hidden) },
    { id: "lock", label: locked ? "Unlock" : "Lock", icon: locked ? <LockOpen /> : <Lock />, hint: "Ctrl+Shift+L", disabled: root, onSelect: () => onFlag("locked", at, !locked) },
    "separator",
    entry("copy", "Copy", <Copy />, "Ctrl+C"),
    entry("cut", "Cut", <Scissors />, "Ctrl+X"),
    entry("paste", "Paste", <ClipboardPaste />, "Ctrl+V", !canPaste),
    // a flyout of its own, so its rows' names never read as Copy and Paste's
    {
      id: "style",
      label: "Style",
      icon: <Paintbrush />,
      disabled: root,
      submenu: [entry("copy-style", "Copy style", <Copy />, undefined, root || many > 1), entry("paste-style", "Paste style", <ClipboardPaste />, undefined, root || !canPasteStyle)],
    },
    "separator",
    entry("wrap", "Wrap in a row", <Columns3 />, "Ctrl+G"),
    entry("wrap-card", "Wrap in a card", <LayoutPanelTop />, undefined),
    entry("wrap-grid", "Wrap in a grid", <Grid2x2 />, undefined),
    entry("unwrap", "Unwrap", <SquareDashed />, "Ctrl+Shift+G", root || many > 1 || !container),
    entry("up", "Move up", <ArrowUp />, "Alt+↑", root || many > 1),
    entry("down", "Move down", <ArrowDown />, "Alt+↓", root || many > 1),
    entry("out", "Move out", <ArrowUpLeft />, "Alt+←", at.length < 2 || many > 1),
    // flyouts (Phase 4), so the menu's own rows stay as many as the keyboard walks
    {
      id: "move-to",
      label: "Move to",
      icon: <FolderInput />,
      disabled: root || !targets.length,
      submenu: targets.map((t) => ({ id: `move-to:${t.path.join(".")}`, label: t.label, disabled: !!t.why, title: t.why, onSelect: () => onMoveTo(at, t.path) })),
    },
    {
      id: "select",
      label: "Select",
      icon: <MousePointer2 />,
      disabled: root,
      submenu: [entry("select-parent", "Select parent", <ArrowUpLeft />, undefined), entry("select-children", "Select children", <ListTree />, undefined, root || !hasChildren)],
    },
    {
      id: "layer",
      label: "Layer",
      icon: <Layers2 />,
      disabled: root,
      submenu: [
        background ? entry("foreground", "Remove from background", <Wallpaper />, undefined) : entry("background", "Set as background", <Wallpaper />, undefined),
        "separator",
        entry("forward", "Bring forward", <ChevronUp />, undefined, root || many > 1),
        entry("backward", "Send backward", <ChevronDown />, undefined, root || many > 1),
        entry("front", "To front", <BringToFront />, undefined, root || many > 1),
        entry("back", "To back", <SendToBack />, undefined, root || many > 1),
      ],
    },
    "separator",
    entry("delete", "Delete", <Trash2 />, "Del", root, true),
  ];
}

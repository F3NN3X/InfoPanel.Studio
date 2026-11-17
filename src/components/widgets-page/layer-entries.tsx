// The layer menu's rows (builder plan Phase 2), one list for Layers' right-click and the stage's: the same commands on the same
// selection wherever the menu opens. Each row runs a `LayerCommand` on the row it opened on (the selection, when that row is in it).
import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpLeft, ClipboardPaste, Columns3, Copy, CopyPlus, Eye, EyeOff, Grid2x2, LayoutPanelTop, Lock, LockOpen, Paintbrush, Pencil, Scissors, SquareDashed, Trash2 } from "lucide-react";
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
  | "delete";

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
  onCommand: (cmd: LayerCommand, at: number[]) => void;
  onRename: (at: number[]) => void;
  onFlag: (flag: EditorFlag, at: number[], on: boolean) => void;
}

/** The layer menu's rows for the row `at`. The root card takes only Paste. */
export function layerEntries({ at, many, container, hidden, locked, canPaste, canPasteStyle, onCommand, onRename, onFlag }: LayerEntriesOf): ContextMenuEntry[] {
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
    "separator",
    entry("delete", "Delete", <Trash2 />, "Del", root, true),
  ];
}

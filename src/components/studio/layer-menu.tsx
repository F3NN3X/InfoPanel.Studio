/**
 * The layer menu (Edit v3 SPEC §8.3): right-click on a Layers row or a part on the canvas. Its rows and their order are
 * fixed; a row that doesn't apply to the selection is disabled, never hidden. Both pages' hosts (`use-page-layers.ts`,
 * `canvas-layers.ts`) run the same actions behind it, its shortcuts and the inspector's LAYER buttons.
 */
import {
  ArrowDown,
  ArrowUp,
  BookmarkPlus,
  BringToFront,
  Copy,
  EyeOff,
  FolderInput,
  FolderMinus,
  FolderPlus,
  Grid3x3,
  Lock,
  Pencil,
  SendToBack,
  Trash2,
} from "lucide-react";
import type { ReactNode } from "react";
import { ContextMenu, type ContextMenuEntry } from "@/components/ui/context-menu";
import type { LayerAction } from "@/lib/page-model/layer-actions";

/** What the menu needs from a page's Layers: which actions apply, the groups to move into, and how to run each. */
export interface LayerMenuHost {
  available: Record<LayerAction, boolean>;
  /** The page's groups, top first, for Move to group. */
  groups: readonly { id: string; name: string }[];
  run: (action: LayerAction) => void;
  /** Into a group, or `null`: a new group around the selection. */
  moveToGroup: (groupId: string | null) => void;
  /** Rename the selected node inline (one node selected). */
  rename?: () => void;
  /** Save the selection to the Library (where the page can). */
  saveToLibrary?: () => void;
  /** Save to Library is listed but off, `Coming soon` (a screen page, until it can save a selection: sign-off round 1). */
  saveToLibrarySoon?: boolean;
}

/** The tooltip on Save to Library where it isn't built yet (a screen page; its Group inspector says the same). */
const LIBRARY_SOON = "Coming soon";

/** The menu's rows, in the SPEC's order. */
export function layerMenuEntries(host: LayerMenuHost): ContextMenuEntry[] {
  const a = host.available;
  const row = (id: LayerAction, label: string, icon: ReactNode, hint?: string, danger?: boolean): ContextMenuEntry => ({
    id,
    label,
    icon,
    hint,
    danger,
    disabled: !a[id],
    onSelect: () => host.run(id),
  });
  return [
    row("front", "Bring to front", <BringToFront />, "Ctrl+Shift+]"),
    row("forward", "Bring forward", <ArrowUp />, "Ctrl+]"),
    row("backward", "Send backward", <ArrowDown />, "Ctrl+["),
    row("back", "Send to back", <SendToBack />, "Ctrl+Shift+["),
    "separator",
    row("group", "Group selection", <FolderPlus />, "Ctrl+G"),
    row("ungroup", "Ungroup", <FolderMinus />, "Ctrl+Shift+G"),
    {
      id: "move-to-group",
      label: "Move to group",
      icon: <FolderInput />,
      disabled: !a.group,
      submenu: [
        ...host.groups.map((g): ContextMenuEntry => ({ id: `group:${g.id}`, label: g.name, onSelect: () => host.moveToGroup(g.id) })),
        ...(host.groups.length ? ["separator" as const] : []),
        { id: "new-group", label: "New group", icon: <FolderPlus />, onSelect: () => host.moveToGroup(null) },
      ],
    },
    "separator",
    row("snap", "Snap to grid", <Grid3x3 />),
    row("lock", "Lock", <Lock />, "Ctrl+L"),
    row("hide", "Hide", <EyeOff />, "Ctrl+H"),
    "separator",
    { id: "rename", label: "Rename", icon: <Pencil />, hint: "F2", disabled: !host.rename, onSelect: () => host.rename?.() },
    row("duplicate", "Duplicate", <Copy />, "Ctrl+D"),
    row("delete", "Delete", <Trash2 />, "Del", true),
    ...(host.saveToLibrary
      ? (["separator", { id: "save-to-library", label: "Save to Library", icon: <BookmarkPlus />, hint: "Ctrl+Shift+S", onSelect: host.saveToLibrary }] as ContextMenuEntry[])
      : host.saveToLibrarySoon
        ? (["separator", { id: "save-to-library", label: "Save to Library", icon: <BookmarkPlus />, disabled: true, title: LIBRARY_SOON }] as ContextMenuEntry[])
        : []),
  ];
}

/** The layer menu at a viewport point; `extra` rows (a widget's own) go below its last section. */
export function LayerMenu({ x, y, host, extra, onClose }: { x: number; y: number; host: LayerMenuHost; extra?: ContextMenuEntry[]; onClose: () => void }) {
  const entries = layerMenuEntries(host);
  return <ContextMenu x={x} y={y} width={230} testId="layer-menu" entries={extra?.length ? [...entries, "separator", ...extra] : entries} onClose={onClose} />;
}

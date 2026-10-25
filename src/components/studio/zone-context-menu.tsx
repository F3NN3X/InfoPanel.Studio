import { useState, type ReactNode } from "react";
import {
  BookmarkPlus,
  Clipboard,
  ClipboardPaste,
  Copy,
  Eye,
  EyeOff,
  FoldHorizontal,
  FoldVertical,
  Globe,
  Keyboard,
  Link2,
  Maximize,
  MoveRight,
  Paintbrush,
  Palette,
  Plus,
  Replace,
  Share,
  SquareDashedMousePointer,
  Trash2,
  UnfoldHorizontal,
  UnfoldVertical,
  X,
} from "lucide-react";
import { ContextMenu, type ContextMenuEntry } from "@/components/ui/context-menu";
import { BLANK_MODULE, CANVAS_ID, CARDS_ID } from "@/lib/layout";
import type { CommandAction } from "./commands";
import type { StudioSelection } from "./use-studio-selection";
import { canvasMenu, menuAction, zoneMenu, type MenuItemId, type MenuSpec } from "./zone-menu";

/** Where and what a context menu was opened on. */
export interface ContextMenuTarget {
  kind: "zone" | "canvas";
  /** Viewport position. */
  x: number;
  y: number;
}

const ICONS: Record<MenuItemId, ReactNode> = {
  pick: <Replace />,
  "edit-style": <Paintbrush />,
  "bind-data": <Link2 />,
  "save-panel": <BookmarkPlus />,
  "convert-zone": <Share />,
  duplicate: <Copy />,
  visible: null, // Eye / EyeOff by the label
  "move-to-page": <MoveRight />,
  narrower: <FoldHorizontal />,
  wider: <UnfoldHorizontal />,
  shorter: <FoldVertical />,
  taller: <UnfoldVertical />,
  "copy-style": <Clipboard />,
  "paste-style": <ClipboardPaste />,
  "follow-global": <Globe />,
  "global-all": <Globe />,
  "global-profile": <Globe />,
  deselect: <X />,
  remove: <Trash2 />,
  "add-widget": <Plus />,
  "select-all": <SquareDashedMousePointer />,
  "zoom-fit": <Maximize />,
  "edit-theme": <Palette />,
  shortcuts: <Keyboard />,
};

function entriesOf(spec: MenuSpec, run: (action: CommandAction) => void): ContextMenuEntry[] {
  return spec.map((item): ContextMenuEntry => {
    if (item === "separator") return item;
    if (item.id === "move-to-page") {
      return {
        id: item.id,
        label: item.label,
        icon: ICONS[item.id],
        submenu: (item.pages ?? []).map((p) => ({
          id: `page:${p.id}`,
          label: p.name,
          onSelect: () => run({ type: "move-to-page", id: p.id }),
        })),
      };
    }
    const action = menuAction(item.id);
    return {
      id: item.id,
      label: item.label,
      hint: item.hint,
      danger: item.danger,
      disabled: item.disabled,
      icon: item.id === "visible" ? item.label === "Hide" ? <EyeOff /> : <Eye /> : ICONS[item.id],
      onSelect: () => run(action),
    };
  });
}

/** The open context menu's state for the canvas, the Layers rows and the chip's More button. */
export function useContextMenu(sel: StudioSelection) {
  const [menu, setMenu] = useState<ContextMenuTarget | null>(null);
  return {
    menu,
    /** Open the zone menu for `id` (selecting it first if it isn't), or the canvas menu for null. */
    open: (id: string | null, x: number, y: number) => {
      if (id !== null && !sel.selectedIds.includes(id)) sel.select(id);
      setMenu({ kind: id === null ? "canvas" : "zone", x, y });
    },
    close: () => setMenu(null),
  };
}

interface StudioContextMenuProps {
  menu: ContextMenuTarget;
  sel: StudioSelection;
  canPasteStyle: boolean;
  /** Whether the primary zone can take this size step. */
  canStep: (cols: number, rows: number) => boolean;
  /** The profile's other pages, for "Move to page". */
  otherPages: { id: string; name: string }[];
  onRun: (action: CommandAction) => void;
  onClose: () => void;
}

/** The zone menu (selection) or the canvas menu, as a right-click popup. */
export function StudioContextMenu({ menu, sel, canPasteStyle, canStep, otherPages, onRun, onClose }: StudioContextMenuProps) {
  const spec =
    menu.kind === "canvas" || !sel.selected
      ? canvasMenu()
      : zoneMenu({
          count: sel.selection.length,
          panel: Boolean(sel.selected.panel),
          convertible: ![CANVAS_ID, BLANK_MODULE, CARDS_ID].includes(sel.selected.module),
          anyVisible: sel.selection.some((p) => p.visible),
          canPasteStyle,
          canStep,
          otherPages,
        });
  return <ContextMenu x={menu.x} y={menu.y} entries={entriesOf(spec, onRun)} onClose={onClose} />;
}

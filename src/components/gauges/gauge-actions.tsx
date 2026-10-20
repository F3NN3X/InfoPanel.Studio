/**
 * What can be done with a gauge, in one place: the detail pane's buttons and the card's right-click
 * menu both read it, so they enable and disable together.
 */
import { Copy, Gauge, Pencil, Plus, Trash2, Upload, type LucideIcon } from "lucide-react";
import type { ContextMenuEntry } from "@/components/ui/context-menu";
import type { LibraryItem } from "@/lib/library";
import type { GaugeEntry } from "@/lib/gauge-studio/model";

export interface GaugeAction {
  label: string;
  icon: LucideIcon;
  run: () => void;
  disabled?: boolean;
  title?: string;
  /** An image sequence goes into one of these canvas zones: the pane lists them, the menu opens them as a flyout. */
  choices?: { id: string; label: string; run: () => void }[];
}

export interface GaugeActionHandlers {
  /** The page's canvas zones: where an image sequence can go. */
  canvasZones: { id: string; name: string }[];
  onEdit: () => void;
  onAddToCanvas: () => void;
  /** Insert an image sequence into one of `canvasZones`. */
  onAddToZone: (zoneId: string) => void;
  onDuplicate: () => void;
  onExport: () => void;
}

export interface GaugeActions {
  /** Open in the editor (the pane words it "Customise a copy" for a preset). */
  edit: GaugeAction;
  secondary: GaugeAction[];
}

export function gaugeActions(entry: GaugeEntry, h: GaugeActionHandlers): GaugeActions {
  const vector = entry.gauge !== null;
  // A canvas image sequence copies to the library when the asset store holds all its frames.
  const exportable = vector || !!entry.frames?.length;
  const copyable = vector || entry.source.kind === "library" || entry.files !== undefined;
  return {
    edit: { label: "Open in editor", icon: Gauge, run: h.onEdit },
    secondary: [
      vector
        ? { label: "Add to canvas", icon: Plus, run: h.onAddToCanvas }
        : {
            label: "Add to canvas",
            icon: Plus,
            run: () => {},
            disabled: h.canvasZones.length === 0 || !entry.files?.length,
            title: h.canvasZones.length === 0 ? "An image sequence goes into a canvas zone: this page has none" : !entry.files?.length ? "Some of its frames are not files in the asset store" : "Choose the canvas zone to put it in",
            choices: h.canvasZones.map((z) => ({ id: z.id, label: z.name, run: () => h.onAddToZone(z.id) })),
          },
      { label: "Duplicate", icon: Copy, run: h.onDuplicate, disabled: !copyable, title: copyable ? undefined : "Some of its frames are not files in the asset store" },
      { label: "Export", icon: Upload, run: h.onExport, disabled: !exportable, title: vector ? "Download as .gauge.json" : exportable ? "Download the frames as a .gauge-frames.zip" : "This image sequence has no frames to export" },
    ],
  };
}

export interface GaugeMenuHandlers {
  /** Given for a gauge that is a library item; a preset or a profile gauge has no name or file of its own to change. */
  onRename?: () => void;
  onDelete?: () => void;
}

/** Rename and Delete are the page's to give, and only for a gauge that is a library item. */
export const libraryMenuHandlers = (item: LibraryItem | undefined, h: Required<GaugeMenuHandlers>): GaugeMenuHandlers => (item ? h : {});

/** The card's right-click menu: the actions, then Rename and Delete for a library gauge. */
export function gaugeMenuEntries(actions: GaugeActions, h: GaugeMenuHandlers): ContextMenuEntry[] {
  const entry = (a: GaugeAction): ContextMenuEntry => ({
    id: a.label,
    label: a.label,
    icon: <a.icon />,
    disabled: a.disabled,
    ...(a.choices && !a.disabled ? { submenu: a.choices.map((c): ContextMenuEntry => ({ id: c.id, label: c.label, onSelect: c.run })) } : { onSelect: a.run }),
  });
  return [
    entry(actions.edit),
    ...actions.secondary.map(entry),
    ...(h.onRename && h.onDelete
      ? [
          "separator" as const,
          { id: "rename", label: "Rename", icon: <Pencil />, onSelect: h.onRename },
          { id: "delete", label: "Delete from library…", icon: <Trash2 />, hint: "Del", danger: true, onSelect: h.onDelete },
        ]
      : []),
  ];
}

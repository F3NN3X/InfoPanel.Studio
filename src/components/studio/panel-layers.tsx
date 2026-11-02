import { useState, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import { Menu } from "@base-ui/react/menu";
import { ArrowUp, Copy, Eye, EyeOff, GripVertical, MoreHorizontal, Trash2 } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import type { Widget, WidgetKind } from "@/lib/panel-model";
import { cn } from "@/lib/utils";
import { ITEM, POPUP } from "./menu-styles";
import { ChangeKindSubmenu } from "./widget-kind-menu";
import { KIND_INFO, sensorName, widgetName } from "./widget-kinds";

/** Drag payload type of a layer row (only rows of this list accept it). */
const DND_MIME_WIDGET = "application/x-infopanel-widget";

interface PanelLayersProps {
  widgets: Widget[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggleVisible: (id: string) => void;
  /** Move a widget so it ends up at `index`. */
  onMove: (id: string, index: number) => void;
  onDuplicate: (id: string) => void;
  onCopy: (id: string) => void;
  /** Paste the copied widget after this one; omitted = nothing copied. */
  onPasteAfter?: (id: string) => void;
  onChangeKind: (id: string, kind: WidgetKind) => void;
  onRemove: (id: string) => void;
}

/**
 * The panel's widgets as layers (README §4.6): drag a row (or Alt+↑/↓ with
 * the list focused) to reorder, ↑/↓ to select; each row hides, duplicates
 * and deletes, and its "⋯" copies, pastes and changes the kind.
 */
export function PanelLayers({
  widgets,
  selectedId,
  onSelect,
  onToggleVisible,
  onMove,
  onDuplicate,
  onCopy,
  onPasteAfter,
  onChangeKind,
  onRemove,
}: PanelLayersProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  // Insertion point while dragging: the row index the dragged one goes before.
  const [dropAt, setDropAt] = useState<number | null>(null);

  const onDragOver = (e: DragEvent, i: number) => {
    if (!dragId || !e.dataTransfer.types.includes(DND_MIME_WIDGET)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const r = e.currentTarget.getBoundingClientRect();
    setDropAt(e.clientY < r.top + r.height / 2 ? i : i + 1);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const from = widgets.findIndex((w) => w.id === dragId);
    if (dragId && from >= 0 && dropAt !== null) onMove(dragId, dropAt > from ? dropAt - 1 : dropAt);
    endDrag();
  };

  const endDrag = () => {
    setDragId(null);
    setDropAt(null);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    // Keys in a row's (portaled) menu bubble here through React: not ours.
    if (!e.currentTarget.contains(e.target as Node)) return;
    const i = widgets.findIndex((w) => w.id === selectedId);
    if (i < 0 || (e.key !== "ArrowUp" && e.key !== "ArrowDown" && e.key !== "Delete")) return;
    e.preventDefault(); // not the studio's zone nudge / remove
    if (e.key === "Delete") return onRemove(widgets[i].id);
    const d = e.key === "ArrowUp" ? -1 : 1;
    if (e.altKey) onMove(widgets[i].id, i + d);
    else if (widgets[i + d]) onSelect(widgets[i + d].id);
  };

  if (widgets.length === 0) {
    return (
      <span className="block py-1 text-caption text-ui-hint">No widgets in this panel yet.</span>
    );
  }

  return (
    <div
      role="listbox"
      aria-label="Widgets (Alt+↑/↓ to reorder)"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDropAt(null)}
      className="space-y-1 rounded-md outline-none focus-visible:ring-1 focus-visible:ring-ui-accent/60"
    >
      {widgets.map((w, i) => {
        const { icon: Icon, label } = KIND_INFO[w.kind];
        return (
          <div
            key={w.id}
            role="option"
            aria-selected={w.id === selectedId}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(DND_MIME_WIDGET, w.id);
              e.dataTransfer.effectAllowed = "move";
              setDragId(w.id);
            }}
            onDragEnd={endDrag}
            onDragOver={(e) => onDragOver(e, i)}
            onDrop={onDrop}
            onClick={() => onSelect(w.id)}
            className={cn(
              "relative flex cursor-pointer items-center gap-[7px] rounded-[7px] border py-1.5 pl-1.5 pr-1",
              w.id === selectedId
                ? "border-ui-accent/50 bg-ui-accent/[.12]"
                : "border-ui-subtle bg-ui-app hover:border-ui-menu",
              w.id === dragId && "opacity-40",
              !w.visible && "opacity-50"
            )}
          >
            {dropAt === i && <DropLine edge="top" />}
            {dropAt === i + 1 && i === widgets.length - 1 && <DropLine edge="bottom" />}
            <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-ui-hint" />
            <Icon className="h-4 w-4 shrink-0 text-ui-3" aria-label={label} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-caption text-ui-1" title={widgetName(w)}>{widgetName(w)}</span>
              <span className="block truncate text-micro text-ui-4">
                {`${label} · ${w.sensor ? sensorName(w.sensor) : "no sensor"}`}
              </span>
            </span>
            <RowButton label="Move up" onClick={() => onMove(w.id, i - 1)}>
              <ArrowUp className="h-3.5 w-3.5" />
            </RowButton>
            <RowButton
              label={w.visible ? "Hide widget" : "Show widget"}
              onClick={() => onToggleVisible(w.id)}
            >
              {w.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            </RowButton>
            <RowButton label="Duplicate widget" onClick={() => onDuplicate(w.id)}>
              <Copy className="h-3.5 w-3.5" />
            </RowButton>
            <RowButton label="Delete widget" danger onClick={() => onRemove(w.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </RowButton>
            <Menu.Root>
              <Menu.Trigger
                onClick={(e) => e.stopPropagation()}
                className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[5px] text-ui-3 hover:bg-ui-hover hover:text-ui-1 data-popup-open:bg-ui-hover data-popup-open:text-ui-1"
                title="Widget actions"
                aria-label="Widget actions"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Positioner className="z-50" sideOffset={4} align="end">
                  <Menu.Popup className={POPUP}>
                    <Menu.Item className={ITEM} onClick={() => onCopy(w.id)}>
                      Copy
                    </Menu.Item>
                    <Menu.Item className={ITEM} disabled={!onPasteAfter} onClick={() => onPasteAfter?.(w.id)}>
                      Paste after
                    </Menu.Item>
                    <ChangeKindSubmenu kind={w.kind} onChange={(kind) => onChangeKind(w.id, kind)} />
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
          </div>
        );
      })}
    </div>
  );
}

/** A row's icon button (clicks stay off the row's select). */
function RowButton({
  label,
  danger,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <IconButton
      label={label}
      danger={danger}
      className="h-[22px] w-[22px]"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {children}
    </IconButton>
  );
}

/** The insertion line shown while dragging a row. */
function DropLine({ edge }: { edge: "top" | "bottom" }) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute inset-x-0 h-0.5 rounded-full bg-ui-accent",
        edge === "top" ? "-top-[3px]" : "-bottom-[3px]"
      )}
    />
  );
}

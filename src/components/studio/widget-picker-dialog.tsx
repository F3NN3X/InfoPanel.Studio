import { useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { SquareDashed, X } from "lucide-react";
import { BLANK_MODULE, type Placement } from "@/lib/layout";
import type { UserPanelPreset } from "@/lib/panel-model";
import {
  filterInsertables,
  isBlankZone,
  insertables,
  InsertFilters,
  InsertList,
  type InsertCategory,
} from "./insert-panel";
import { placementTitle } from "./studio-modules";

interface WidgetPickerDialogProps {
  /** The zone to assign a widget to; null = closed. */
  placement: Placement | null;
  /** The user's saved panels (`config.panelPresets`). */
  savedPanels?: UserPanelPreset[];
  onRenamePreset: (id: string, name: string) => void;
  onDeletePreset: (id: string) => void;
  /** Assign: "blank", "module:<id>" or "preset:<id>". */
  onPick: (value: string) => void;
  onClose: () => void;
}

/** Search, categories and the list; remounts (resets) on every open. */
function PickerBody({
  placement,
  savedPanels,
  onPick,
  onRenamePreset,
  onDeletePreset,
}: Omit<WidgetPickerDialogProps, "onClose" | "placement"> & { placement: Placement }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<InsertCategory>("All");
  return (
    <>
      <div className="border-b border-ui-subtle p-3">
        <InsertFilters
          query={query}
          onQuery={setQuery}
          category={category}
          onCategory={setCategory}
          autoFocus
        />
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {placement.module !== BLANK_MODULE && (
          <button
            type="button"
            onClick={() => onPick("blank")}
            className="flex h-[30px] w-full items-center gap-2 rounded-md border border-dashed border-ui-edge px-2 text-left text-xs text-ui-3 hover:border-ui-accent hover:text-ui-1"
          >
            <SquareDashed className="h-3.5 w-3.5" /> Blank zone — remove the widget
          </button>
        )}
        <InsertList
          items={filterInsertables(insertables(savedPanels).filter((i) => !isBlankZone(i)), query, category)}
          context="picker"
          onPick={(item) => onPick(`${item.kind === "panel" ? "preset" : "module"}:${item.id}`)}
          onRenamePreset={onRenamePreset}
          onDeletePreset={onDeletePreset}
        />
      </div>
    </>
  );
}

/**
 * Pick the widget (or panel) for a zone: search, categories and minimum
 * sizes, plus "Blank zone". The zone grows to the widget's minimum size.
 */
export function WidgetPickerDialog({ placement, onClose, ...body }: WidgetPickerDialogProps) {
  const popupRef = useRef<HTMLDivElement>(null);
  return (
    <Dialog.Root open={placement !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Popup
          ref={popupRef}
          initialFocus={() => popupRef.current?.querySelector("input") ?? true}
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[80vh] w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-ui-strong bg-ui-raised font-ui text-ui-1 shadow-ui-modal outline-none"
        >
          {placement && (
            <>
              <div className="flex items-start gap-2 border-b border-ui-subtle px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <Dialog.Title className="text-sm font-semibold text-ui-1">Pick a widget</Dialog.Title>
                  <Dialog.Description className="truncate text-xs text-ui-4">
                    Zone {placement.colSpan}×{placement.rowSpan} · now {placementTitle(placement)}
                  </Dialog.Description>
                </div>
                <Dialog.Close
                  title="Close"
                  aria-label="Close"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ui-4 hover:bg-ui-hover hover:text-ui-1"
                >
                  <X className="h-4 w-4" />
                </Dialog.Close>
              </div>
              <PickerBody placement={placement} {...body} />
            </>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

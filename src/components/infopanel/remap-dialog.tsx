/**
 * Remap from the canvas zone editor (spec §5, §7): the import's remap panel over the zone's binding
 * groups. Each choice is one change to the zone (one undo step). With the Data API offline nothing
 * can be resolved, so the panel shows the keys as they are and takes no choices.
 */
import { useMemo } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { useSensorCatalog } from "@/lib/catalog";
import { indexCatalog, resolveAll, type CatalogIndex, type Group } from "@/lib/infopanel/remap/remap";
import { buildCatalog, type DataApiValue } from "@/lib/infopanel/sensors";
import { RemapPanel } from "./remap-panel";

/** The Data API catalog, indexed for remapping; `online` is false until it has answered. */
/** `unreachable`: the Data API did not answer (not merely still loading). */
export function useRemapIndex(): { index: CatalogIndex; online: boolean; unreachable: boolean } {
  const catalog = useSensorCatalog();
  const sensors = catalog.sensors as Record<string, DataApiValue>;
  const keysSig = Object.keys(sensors).join("\n");
  const index = useMemo(() => indexCatalog(buildCatalog(sensors)), [keysSig]);
  return { index, online: catalog.status === "ready", unreachable: catalog.status === "error" };
}

export interface RemapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  groups: readonly Group[];
  overrides: Map<string, string>;
  index: CatalogIndex;
  online: boolean;
  onOverrides: (next: Map<string, string>) => void;
  /** The "N items" chip: select those items (the dialog closes). */
  onSelectItems: (paths: string[]) => void;
}

export function RemapDialog({ open, onOpenChange, name, groups, overrides, index, online, onOverrides, onSelectItems }: RemapDialogProps) {
  const resolved = useMemo(() => resolveAll([...groups], index, overrides), [groups, index, overrides]);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Popup data-help-article="remap" className="fixed left-1/2 top-1/2 z-50 flex h-[min(640px,calc(100vh-48px))] w-[min(980px,calc(100vw-48px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[14px] border border-ui-strong bg-ui-panel font-ui text-ui-1 shadow-ui-modal outline-none">
          <div className="flex shrink-0 items-center gap-3 border-b border-ui-subtle px-5 py-3.5">
            <Dialog.Title className="flex-1 truncate text-[15px] font-semibold text-ui-1">Sensor remap · {name}</Dialog.Title>
            <Dialog.Close title="Close" aria-label="Close" className="grid h-8 w-8 place-items-center rounded-md text-ui-4 hover:bg-ui-hover hover:text-ui-1">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          {!online && (
            <div role="status" className="mx-5 mt-3 rounded-lg border border-ui-warning/40 bg-ui-warning/10 px-3 py-2 text-caption text-ui-2">
              The Data API isn’t reachable, so no sensor can be matched or chosen. The items keep the keys they have.
            </div>
          )}
          <div className="min-h-0 flex-1">
            <RemapPanel
              groups={groups}
              resolved={resolved}
              index={index}
              overrides={overrides}
              onOverrides={(next) => {
                if (online) onOverrides(next);
              }}
              onSelectItems={(paths) => {
                onSelectItems(paths);
                onOpenChange(false);
              }}
            />
          </div>
          <div className="flex shrink-0 justify-end border-t border-ui-subtle px-5 py-3">
            <Dialog.Close className="h-8 rounded-ui-md bg-ui-accent px-4 text-[12.5px] font-medium text-ui-inverse-fg hover:opacity-90">Done</Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

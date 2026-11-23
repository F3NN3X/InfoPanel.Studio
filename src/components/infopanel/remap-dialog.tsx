/**
 * Remap from the canvas zone editor (spec §5, §7): the import's remap panel over the zone's binding
 * groups. Each choice is one change to the zone (one undo step). With the Data API offline nothing
 * can be resolved, so the panel shows the keys as they are and takes no choices.
 */
import { useMemo } from "react";
import { DialogParts } from "@/components/ui/dialog";
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
    <DialogParts.Root open={open} onOpenChange={onOpenChange}>
      <DialogParts.Content layout="panel" data-help-article="remap" className="flex h-[min(640px,calc(100vh-48px))] w-[min(980px,calc(100vw-48px))] flex-col overflow-hidden rounded-14 bg-ui-panel">
        <div className="flex shrink-0 items-center gap-3 border-b border-ui-subtle px-5 py-3.5">
          <DialogParts.Title className="flex-1 truncate text-title font-medium text-ui-1">Sensor remap · {name}</DialogParts.Title>
          <DialogParts.Close title="Close" aria-label="Close" className="grid h-8 w-8 place-items-center rounded-md text-ui-4 hover:bg-ui-hover hover:text-ui-1">
            <X className="h-4 w-4" />
          </DialogParts.Close>
        </div>
        {!online && (
          <div role="status" className="mx-5 mt-3 rounded-lg border border-ui-warn/40 bg-ui-warn/10 px-3 py-2 text-caption text-ui-2">
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
          <DialogParts.Close className="h-8 rounded-ui-md bg-ui-inverse px-4 text-body font-medium text-ui-inverse-fg hover:bg-white">Done</DialogParts.Close>
        </div>
      </DialogParts.Content>
    </DialogParts.Root>
  );
}

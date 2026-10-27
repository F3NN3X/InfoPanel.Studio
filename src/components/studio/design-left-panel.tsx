import { lazy, Suspense, type ComponentProps, type ReactNode } from "react";
import { Segmented } from "@/components/ui/segmented";
import type { AddPanel as AddPanelView } from "./add-panel";
import type { LayersHost } from "./layers-tree";

// Their own chunks, so the studio's first download stays within its budget.
const LayersTree = lazy(() => import("./layers-tree").then((m) => ({ default: m.LayersTree })));
const AddPanel = lazy(() => import("./add-panel").then((m) => ({ default: m.AddPanel })));

/** The left panel's tabs: Layers or the Add panel. */
export type LeftTab = "layers" | "add";

interface DesignLeftPanelProps {
  tab: LeftTab;
  onTab: (tab: LeftTab) => void;
  /** The panel's width (Settings › Studio › Editor › Left panel width). */
  width: number;
  layers: LayersHost;
  add: ComponentProps<typeof AddPanelView>;
}

/** The left panel's frame: the Layers | Add tabs over the tab's body. A grid page's and a Free page's share it. */
export function LeftPanelFrame({ tab, onTab, width, children }: Pick<DesignLeftPanelProps, "tab" | "onTab" | "width"> & { children: ReactNode }) {
  return (
    <aside className="relative flex shrink-0 flex-col border-r border-ui-subtle bg-ui-panel font-ui" style={{ width }}>
      <div className="shrink-0 px-3 pb-2 pt-3">
        <Segmented
          label="Left panel"
          className="w-full flex-nowrap [&>button]:flex-1"
          value={tab}
          onChange={onTab}
          options={[
            { value: "layers", label: "Layers" },
            { value: "add", label: "Add" },
          ]}
        />
      </div>
      {children}
    </aside>
  );
}

/** Edit's left panel on a grid page (SPEC §6.1): Layers | Add, beside the rail. */
export function DesignLeftPanel({ tab, onTab, width, layers, add }: DesignLeftPanelProps) {
  return (
    <LeftPanelFrame tab={tab} onTab={onTab} width={width}>
      {tab === "layers" ? (
        <Suspense fallback={<div className="flex-1" />}>
          <LayersTree host={layers} />
        </Suspense>
      ) : (
        <Suspense fallback={<div className="flex-1" />}>
          <AddPanel {...add} />
        </Suspense>
      )}
    </LeftPanelFrame>
  );
}

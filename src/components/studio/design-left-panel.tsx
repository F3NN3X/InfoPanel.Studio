import { lazy, Suspense, useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import { Segmented } from "@/components/ui/segmented";
import type { AddPanel as AddPanelView } from "./add-panel";
import type { LayersHost } from "./layers-tree";
import { isTyping } from "./use-studio-shortcuts";

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

/** "/" pressed while Layers showed (Edit v3 SPEC §14): the Add panel takes its search once it mounts. */
let searchWanted = false;
/** Whether "/" asked for Add's search; asking clears it. */
export function takeSearchRequest(): boolean {
  const wanted = searchWanted;
  searchWanted = false;
  return wanted;
}

/** The left panel's frame: the Layers | Add tabs over the tab's body. A grid page's and a Free page's share it. */
export function LeftPanelFrame({ tab, onTab, width, children }: Pick<DesignLeftPanelProps, "tab" | "onTab" | "width"> & { children: ReactNode }) {
  // "/" anywhere in Edit opens Add with its search focused; on the Add tab the panel's own key does it.
  const latest = useRef({ tab, onTab });
  latest.current = { tab, onTab };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || latest.current.tab === "add" || isTyping(e.target as Element | null) || document.querySelector("[role=dialog]")) return;
      e.preventDefault();
      searchWanted = true;
      latest.current.onTab("add");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <aside className="relative flex shrink-0 flex-col border-r border-ui-subtle bg-ui-panel font-ui" style={{ width }}>
      <div className="shrink-0 px-3 pb-2 pt-3">
        <Segmented
          label="Left panel"
          // The one-editor spec tabs onto the unselected Layers radio (fixtures.spec.ts tabTo), so both stay tab stops.
          roving={false}
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

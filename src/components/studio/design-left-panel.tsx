import type { ComponentProps } from "react";
import { Segmented } from "@/components/ui/segmented";
import { AddPanel } from "./add-panel";
import { LayersPanel } from "./layers-panel";

/** The left panel's tabs: the zone list or the Add panel. */
export type LeftTab = "layers" | "add";

interface DesignLeftPanelProps {
  tab: LeftTab;
  onTab: (tab: LeftTab) => void;
  /** The panel's width (Settings › Studio › Editor › Left panel width). */
  width: number;
  layers: ComponentProps<typeof LayersPanel>;
  add: ComponentProps<typeof AddPanel>;
}

/** The Design view's left panel (SPEC §6.1): Layers | Add, beside the rail. */
export function DesignLeftPanel({ tab, onTab, width, layers, add }: DesignLeftPanelProps) {
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
      {tab === "layers" ? <LayersPanel {...layers} /> : <AddPanel {...add} />}
    </aside>
  );
}

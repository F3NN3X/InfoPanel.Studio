import { useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import { Segmented } from "@/components/ui/segmented";
import { DEFAULT_API_BASE } from "@/lib/data-api";
import { AlertsPanel } from "./alerts-panel";
import { DataApiPanel } from "./data-api-panel";
import { IslandPanel } from "./island-panel";

/** Which of the two interim Alerts & Island panels shows. */
export type AlertsTab = "alerts" | "island";

/** The old drawer panels were built for a narrow column: an interim view centres one in a bounded column. */
function PanelColumn({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 justify-center overflow-hidden bg-ui-app/40 font-ui">
      <div className="flex min-h-0 w-full max-w-[640px] flex-col border-x border-ui-subtle bg-ui-panel">{children}</div>
    </div>
  );
}

interface AlertsViewProps {
  tab: AlertsTab;
  onTab: (tab: AlertsTab) => void;
  alerts: ComponentProps<typeof AlertsPanel>;
  island: ComponentProps<typeof IslandPanel>;
}

/** Alerts & Island, interim until Phase 5: the existing alerts and Dynamic Island panels, tabbed. */
export function AlertsView({ tab, onTab, alerts, island }: AlertsViewProps) {
  return (
    <PanelColumn>
      <div className="shrink-0 px-3.5 pt-3">
        <Segmented
          label="Alerts & Island"
          value={tab}
          onChange={onTab}
          options={[
            { value: "alerts", label: "Alerts" },
            { value: "island", label: "Dynamic Island" },
          ]}
        />
      </div>
      {tab === "alerts" ? <AlertsPanel {...alerts} /> : <IslandPanel {...island} />}
    </PanelColumn>
  );
}

/**
 * Data's connection, interim until Phase 5b: the Data API URL, a strip above the Sources view (it was the old profile
 * inspector's Behaviour › Connection).
 */
export function ConnectionStrip({
  value,
  onChange,
  openRequest,
}: {
  value: string | undefined;
  onChange: (url: string) => void;
  /** Opens the strip whenever it changes (a link to Data › Connection). */
  openRequest?: number;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (openRequest !== undefined && details.current) details.current.open = true;
  }, [openRequest]);
  return (
    <details ref={details} data-nav-section="connection" className="shrink-0 border-b border-ui-subtle bg-ui-chrome font-ui">
      <summary className="flex h-8 cursor-pointer list-none items-center gap-2 px-4 text-[12px] text-ui-3 hover:text-ui-1">
        <span className="font-medium text-ui-2">Connection</span>
        <span className="font-ui-mono text-[11px] text-ui-4">{value ?? DEFAULT_API_BASE}</span>
      </summary>
      <div className="max-w-[420px] px-4 pb-3 pt-1">
        <DataApiPanel value={value} onChange={onChange} />
      </div>
    </details>
  );
}

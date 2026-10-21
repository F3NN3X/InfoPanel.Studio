import type { ComponentProps, ReactNode } from "react";
import { Monitor } from "lucide-react";
import { Segmented } from "@/components/ui/segmented";
import { isTauri, openSettings } from "@/lib/desktop";
import { AlertsPanel } from "./alerts-panel";
import { IslandPanel } from "./island-panel";
import { ProfilesPanel } from "./profiles-panel";

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

/** Screens, interim until Phase 5: the existing Profiles panel. */
export function ScreensView(props: ComponentProps<typeof ProfilesPanel>) {
  return (
    <PanelColumn>
      <ProfilesPanel {...props} />
    </PanelColumn>
  );
}

/**
 * Settings, interim until Phase 5. Desktop: a button to the existing Settings window (at `section` when a
 * link named one). Browser: the notice of SPEC §10.1.
 */
export function SettingsView({ section }: { section?: string }) {
  const desktop = isTauri();
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-ui-app/40 p-6 font-ui">
      <div className="mx-auto flex max-w-[560px] flex-col gap-3 rounded-xl border border-ui-default bg-ui-panel p-4">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-ui-1">
          <Monitor className="h-[18px] w-[18px] text-ui-3" />
          {desktop ? "App settings" : "App settings live in the desktop app"}
        </div>
        <p className="text-[12px] leading-normal text-ui-3">
          {desktop
            ? "Startup, window, server, updates, coding agents and logs. They open in their own window until they move into the studio."
            : "You're using Studio in a browser, served from the PC running InfoPanel Studio. Startup, window, server, updates, coding agents and logs can only be changed there."}
        </p>
        {desktop && (
          <button
            type="button"
            onClick={() => void openSettings(section).catch(() => {})}
            className="h-8 self-start rounded-[7px] border border-ui-strong bg-ui-raised px-3 text-[12.5px] font-medium text-ui-1 hover:bg-ui-hover"
          >
            Open App settings
          </button>
        )}
      </div>
    </div>
  );
}

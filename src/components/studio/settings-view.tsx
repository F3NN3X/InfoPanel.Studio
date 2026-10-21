import { lazy, Suspense, type ComponentProps } from "react";
import { Monitor } from "lucide-react";
import { BUILD_ID } from "@/lib/buildInfo";
import { isTauri } from "@/lib/desktop";
import { isSectionId } from "@/settings/model/search";
import { cn } from "@/lib/utils";
import { ReadRow } from "./settings-group";
import { SettingsDashboard } from "./settings-dashboard";
import { SettingsStudio } from "./settings-studio";

/** The desktop settings pages, a lazy chunk that only the desktop app loads (PLAN decision 5). */
const EmbeddedSettings = lazy(() => import("@/settings/embedded"));

/** Settings' tabs (SPEC §10.1). */
export type SettingsTab = "dashboard" | "studio" | "app";

interface SettingsViewProps {
  tab: SettingsTab;
  onTab: (tab: SettingsTab) => void;
  /** The App page a link or the tray named; `seq` makes a repeat of the same one count. */
  appSection?: string;
  seq: number;
  dashboard: ComponentProps<typeof SettingsDashboard>;
  studio: ComponentProps<typeof SettingsStudio>;
}

/** The tabs with their subtitles; App's says whether this is the PC the settings belong to. */
const tabs = (desktop: boolean): { id: SettingsTab; label: string; sub: string }[] => [
  { id: "dashboard", label: "Dashboard", sub: "every screen" },
  { id: "studio", label: "Studio", sub: "this browser" },
  { id: "app", label: "App", sub: desktop ? "this PC" : "desktop only" },
];

/** The browser's App tab (SPEC §10.1): what to know, and the little the browser can read. */
function BrowserApp() {
  return (
    <div className="flex max-w-[560px] flex-col gap-3 rounded-[10px] border border-ui-strong bg-ui-panel p-4" data-nav-section="server">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-ui-1">
        <Monitor className="h-[18px] w-[18px] text-ui-3" />
        App settings live in the desktop app
      </div>
      <p className="m-0 text-[12px] leading-normal text-ui-3">
        You&apos;re using Studio in a browser, served from the PC running InfoPanel Studio. Startup, window, server, updates, coding agents and logs can only
        be changed there.
      </p>
      <div className="flex flex-col gap-1">
        <ReadRow label="Server" value={`${window.location.host} · read-only`} />
        <ReadRow label="Kiosk URL" value={`${window.location.origin}/?kiosk=1`} copy />
        <ReadRow label="Desktop version" value={`build ${BUILD_ID}`} />
      </div>
    </div>
  );
}

/**
 * Settings (SPEC §10.1): tabs Dashboard (every screen), Studio (this browser) and App (this PC: the desktop
 * settings pages, or in a browser the notice that they live there), on a 560 px column.
 */
export function SettingsView({ tab, onTab, appSection, seq, dashboard, studio }: SettingsViewProps) {
  const desktop = isTauri();
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-ui-app/40 font-ui">
      <div className="flex shrink-0 items-center gap-4 border-b border-ui-subtle px-6 max-sm:gap-2 max-sm:px-3">
        <h1 className="m-0 py-3 text-[15px] font-semibold text-ui-1">Settings</h1>
        <div role="tablist" aria-label="Settings" className="flex gap-1 self-stretch">
          {tabs(desktop).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => onTab(t.id)}
              className={cn(
                "flex items-center gap-1.5 border-b-2 bg-transparent px-3 text-[12.5px] outline-none focus-visible:bg-ui-hover",
                tab === t.id ? "border-ui-1 text-ui-1" : "border-transparent text-ui-4 hover:text-ui-2"
              )}
            >
              {t.label}
              <span className="text-[10.5px] text-ui-5 max-sm:hidden">{t.sub}</span>
            </button>
          ))}
        </div>
      </div>
      {tab === "app" && desktop ? (
        <Suspense fallback={<div className="flex-1" />}>
          <EmbeddedSettings section={appSection && isSectionId(appSection) ? appSection : undefined} seq={seq} />
        </Suspense>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 max-sm:px-3">
          <div className="max-w-[560px]">
            {tab === "dashboard" && <SettingsDashboard {...dashboard} />}
            {tab === "studio" && <SettingsStudio {...studio} />}
          </div>
          {tab === "app" && <BrowserApp />}
        </div>
      )}
    </div>
  );
}

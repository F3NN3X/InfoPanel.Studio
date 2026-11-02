import { useZoomKeys } from "@/app-window/zoom";
import { settingsHelpTarget } from "@/help/context";
import { useHelpKey } from "@/help/use-help-key";
import { errorText, ipc } from "./ipc";
import { isSectionId, PAGE_NAMES, PREFERENCES_INDEX, SEARCH_INDEX } from "./model/search";
import type { NavGroup } from "./nav";
import { PAGES } from "./pages";
import { RestartBar, Sidebar, TitleBar, ToastView } from "./shell";
import { StoreProvider, useStore } from "./store";
import { PREFERENCE_PAGES, WindowMain } from "./window-pages";

/** Every page, in the order PLAN decision 21 gives: App, then Dashboard and Studio, then the rest. */
const GROUPS: NavGroup[] = [
  { label: "App", items: ["general", "server", "connections", "agents", "touch", "updates"] },
  { label: "Preferences", items: ["dashboard", "studio"] },
  { label: "Troubleshoot", items: ["diagnostics", "logs"] },
  { label: "InfoPanel Studio", items: ["about", "changelog"] },
];
const PAGE_IDS = GROUPS.flatMap((g) => g.items);
const INDEX = [...SEARCH_INDEX, ...PREFERENCES_INDEX];

function Content() {
  const { section, settings, setZoom, found, toast } = useStore();
  useZoomKeys(settings.zoom, setZoom, toast);
  // F1 opens the Help article for the page on show.
  useHelpKey(() => settingsHelpTarget(section), (target) => void ipc.openHelp(target).catch((e) => toast(errorText(e), true)));
  const app = isSectionId(section);
  const { subtitle, wide, Section } = app ? PAGES[section] : PREFERENCE_PAGES[section];
  return (
    <WindowMain title={PAGE_NAMES[section]} subtitle={subtitle} wide={wide} focus={app ? null : found} top={<RestartBar />}>
      <Section />
      <ToastView />
    </WindowMain>
  );
}

/**
 * The Settings window in the desktop app, loaded from the Studio's server (PLAN decision 21): the App pages, which
 * reach the shell through the settings window's own capability (`SETTINGS_PERMISSIONS`, src-tauri/src/control.rs),
 * and the Dashboard and Studio pages. A lazy chunk, so `@tauri-apps/api` stays out of the browser's Settings page.
 */
export default function DesktopSettingsWindow() {
  return (
    <StoreProvider pages={PAGE_IDS}>
      <div className="s-scope flex h-screen flex-col overflow-hidden bg-s-win text-s-t1">
        <TitleBar />
        <div className="flex min-h-0 flex-1">
          <Sidebar groups={GROUPS} index={INDEX} />
          <Content />
        </div>
      </div>
    </StoreProvider>
  );
}
